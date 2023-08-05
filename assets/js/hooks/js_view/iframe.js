import { sha256Base64 } from "../../lib/utils";

// Loading iframe using `srcdoc` disables cookies and browser APIs,
// such as camera and microphone (1), the same applies to `src` with
// data URL, so we need to load the iframe through a regular request.
// Since the iframe is sandboxed we also need `allow-same-origin`.
// Additionally, we cannot load the iframe from the same origin as
// the app, because using `allow-same-origin` together with `allow-scripts`
// would be insecure (2). Consequently, we need to load the iframe
// from a different origin.
//
// When running Livebook on https:// we load the iframe from another
// https:// origin. On the other hand, when running on http:// we want
// to load the iframe from http:// as well, otherwise the browser could
// block asset requests from the https:// iframe to http:// Livebook.
// However, external http:// content is not considered a secure context (3),
// which implies no access to user media. Therefore, instead of using
// http://livebookusercontent.com we use another localhost endpoint. Note that
// this endpoint has a different port than the Livebook web app, that's
// because we need separate origins, as outlined above.
//
// To ensure integrity of the loaded content we manually verify the
// checksum against the expected value.
//
// (1): https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#document_source_security
// (2): https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#attr-sandbox
// (3): https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts

const IFRAME_SHA256 = "vd7g1B8fLBFZH6C6KNpG4H8B0SQ/oIuqKaTW6jD053A=";

export function initializeIframeSource(iframe, iframePort, iframeUrl) {
  const url = getIframeUrl(iframePort, iframeUrl);

  return verifyIframeSource(url).then(() => {
    iframe.sandbox =
      "allow-scripts allow-same-origin allow-downloads allow-modals allow-popups";
    iframe.allow =
      "accelerometer; ambient-light-sensor; camera; display-capture; encrypted-media; fullscreen; geolocation; gyroscope; microphone; midi; usb; xr-spatial-tracking; clipboard-read; clipboard-write";
    iframe.src = url;
  });
}

function getIframeUrl(iframePort, iframeUrl) {
  const protocol = window.location.protocol;

  if (iframeUrl) {
    return iframeUrl.replace(/^https?:/, protocol);
  }

  return protocol === "https:"
    ? "https://livebookusercontent.com/iframe/v4.html"
    : `http://${window.location.hostname}:${iframePort}/iframe/v4.html`;
}

let iframeVerificationPromise = null;

function verifyIframeSource(iframeUrl) {
  if (!iframeVerificationPromise) {
    iframeVerificationPromise = fetch(iframeUrl)
      .then((response) => response.text())
      .then((html) => {
        if (sha256Base64(html) !== IFRAME_SHA256) {
          throw new Error(
            `The iframe loaded from ${iframeUrl} doesn't have the expected checksum ${IFRAME_SHA256}`
          );
        }
      });
  }

  return iframeVerificationPromise;
}
