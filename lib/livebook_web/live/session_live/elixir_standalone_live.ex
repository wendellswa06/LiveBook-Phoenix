defmodule LivebookWeb.SessionLive.ElixirStandaloneLive do
  use LivebookWeb, :live_view

  alias Livebook.{Session, Runtime}

  @impl true
  def mount(
        _params,
        %{"session_pid" => session_pid, "current_runtime" => current_runtime},
        socket
      ) do
    session = Session.get_by_pid(session_pid)

    unless Livebook.Config.runtime_enabled?(Livebook.Runtime.ElixirStandalone) do
      raise "runtime module not allowed"
    end

    if connected?(socket) do
      Session.subscribe(session.id)
    end

    {:ok, assign(socket, session: session, current_runtime: current_runtime, error_message: nil)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="flex-col space-y-5">
      <div :if={@error_message} class="error-box">
        <%= @error_message %>
      </div>
      <p class="text-gray-700">
        Start a new local node to handle code evaluation.
      </p>
      <button class="button-base button-blue" phx-click="init">
        <%= if(matching_runtime?(@current_runtime), do: "Reconnect", else: "Connect") %>
      </button>
    </div>
    """
  end

  defp matching_runtime?(%Runtime.ElixirStandalone{} = runtime), do: Runtime.connected?(runtime)
  defp matching_runtime?(_runtime), do: false

  @impl true
  def handle_event("init", _params, socket) do
    Runtime.ElixirStandalone.new()
    |> Runtime.connect()
    |> case do
      {:ok, runtime} ->
        Session.set_runtime(socket.assigns.session.pid, runtime)
        {:noreply, assign(socket, error_message: nil)}

      {:error, message} ->
        {:noreply, assign(socket, error_message: message)}
    end
  end

  @impl true
  def handle_info({:operation, {:set_runtime, _pid, runtime}}, socket) do
    {:noreply, assign(socket, current_runtime: runtime)}
  end

  def handle_info(_message, socket), do: {:noreply, socket}
end
