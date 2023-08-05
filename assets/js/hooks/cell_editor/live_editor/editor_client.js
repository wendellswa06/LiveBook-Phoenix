/**
 * A manager associated with a particular editor instance,
 * which is responsible for controlling client-server communication
 * and synchronizing the sent/received changes.
 *
 * This class uses `serverAdapter` and `editorAdapter` objects
 * that encapsulate the logic relevant for each part.
 *
 * ## Changes synchronization
 *
 * When the local editor emits a change (represented as delta),
 * the client sends this delta to the server and waits for an acknowledgement.
 * Until the acknowledgement comes, the client keeps all further
 * edits in buffer.
 * The server may send either an acknowledgement or other client's delta.
 * It's important to note that those messages come in what the server
 * believes is chronological order, so any delta received before
 * the acknowledgement should be treated as if it happened before
 * our unacknowledged delta.
 * Other client's delta is transformed against the local unacknowledged
 * deltas and applied to the editor.
 */
export default class EditorClient {
  constructor(serverAdapter, revision) {
    this.serverAdapter = serverAdapter;
    this.revision = revision;
    this.state = new Synchronized(this);
    this._onDelta = null;

    this.serverAdapter.onDelta((delta) => {
      this._handleServerDelta(delta);
    });

    this.serverAdapter.onAcknowledgement(() => {
      this._handleServerAcknowledgement();
    });
  }

  /**
   * Plugs in the editor adapter.
   *
   * The adapter may be set at a later point after initialization, in
   * case the editor is mounted lazily.
   */
  setEditorAdapter(editorAdapter) {
    this.editorAdapter = editorAdapter;

    this.editorAdapter.onDelta((delta) => {
      this._handleClientDelta(delta);
      // This delta comes from the editor, so it has already been applied.
      this._emitDelta(delta);
    });
  }

  /**
   * Registers a callback called with a every delta applied to the editor.
   *
   * These deltas are already transformed such that applying them
   * one by one should eventually lead to the same state as on the server.
   */
  onDelta(callback) {
    this._onDelta = callback;
  }

  _emitDelta(delta) {
    this._onDelta && this._onDelta(delta);
  }

  _handleClientDelta(delta) {
    this.state = this.state.onClientDelta(delta);
  }

  _handleServerDelta(delta) {
    this.revision++;
    this.state = this.state.onServerDelta(delta);
  }

  _handleServerAcknowledgement() {
    this.revision++;
    this.state = this.state.onServerAcknowledgement();
  }

  applyDelta(delta) {
    this.editorAdapter && this.editorAdapter.applyDelta(delta);
    // This delta comes from the server and we have just applied it to the editor.
    this._emitDelta(delta);
  }

  sendDelta(delta) {
    this.serverAdapter.sendDelta(delta, this.revision + 1);
  }

  reportCurrentRevision() {
    this.serverAdapter.reportRevision(this.revision);
  }
}

/**
 * Client is in this state when there is no delta pending acknowledgement
 * (the client is fully in sync with the server).
 */
class Synchronized {
  constructor(client, reportRevisionTimeout = 5000) {
    this.client = client;
    this.reportRevisionTimeoutId = null;
    this.reportRevisionTimeout = reportRevisionTimeout;
  }

  onClientDelta(delta) {
    // Cancel the report request if scheduled,
    // as the client is about to send the revision
    // along with own delta.
    if (this.reportRevisionTimeoutId !== null) {
      clearTimeout(this.reportRevisionTimeoutId);
      this.reportRevisionTimeoutId = null;
    }

    this.client.sendDelta(delta);
    return new AwaitingAcknowledgement(this.client, delta);
  }

  onServerDelta(delta) {
    this.client.applyDelta(delta);

    // The client received a new delta, so let's schedule
    // a request to report the new revision.
    if (this.reportRevisionTimeoutId === null) {
      this.reportRevisionTimeoutId = setTimeout(() => {
        this.client.reportCurrentRevision();
        this.reportRevisionTimeoutId = null;
      }, this.reportRevisionTimeout);
    }

    return this;
  }

  onServerAcknowledgement() {
    throw new Error("Unexpected server acknowledgement.");
  }
}

/**
 * Client is in this state when the client sent one delta and waits
 * for an acknowledgement, while there are no other deltas in a buffer.
 */
class AwaitingAcknowledgement {
  constructor(client, awaitedDelta) {
    this.client = client;
    this.awaitedDelta = awaitedDelta;
  }

  onClientDelta(delta) {
    return new AwaitingWithBuffer(this.client, this.awaitedDelta, delta);
  }

  onServerDelta(delta) {
    // We consider the incoming delta to happen first
    // (because that's the case from the server's perspective).
    const deltaPrime = this.awaitedDelta.transform(delta, "right");
    this.client.applyDelta(deltaPrime);
    const awaitedDeltaPrime = delta.transform(this.awaitedDelta, "left");
    return new AwaitingAcknowledgement(this.client, awaitedDeltaPrime);
  }

  onServerAcknowledgement() {
    return new Synchronized(this.client);
  }
}

/**
 * Client is in this state when the client sent one delta and waits
 * for an acknowledgement, while there are more deltas in a buffer.
 */
class AwaitingWithBuffer {
  constructor(client, awaitedDelta, buffer) {
    this.client = client;
    this.awaitedDelta = awaitedDelta;
    this.buffer = buffer;
  }

  onClientDelta(delta) {
    const newBuffer = this.buffer.compose(delta);
    return new AwaitingWithBuffer(this.client, this.awaitedDelta, newBuffer);
  }

  onServerDelta(delta) {
    // We consider the incoming delta to happen first
    // (because that's the case from the server's perspective).

    // Delta transformed against awaitedDelta
    const deltaPrime = this.awaitedDelta.transform(delta, "right");
    // Delta transformed against both awaitedDelta and the buffer (appropriate for applying to the editor)
    const deltaBis = this.buffer.transform(deltaPrime, "right");

    this.client.applyDelta(deltaBis);

    const awaitedDeltaPrime = delta.transform(this.awaitedDelta, "left");
    const bufferPrime = deltaPrime.transform(this.buffer, "left");

    return new AwaitingWithBuffer(this.client, awaitedDeltaPrime, bufferPrime);
  }

  onServerAcknowledgement() {
    this.client.sendDelta(this.buffer);
    return new AwaitingAcknowledgement(this.client, this.buffer);
  }
}
