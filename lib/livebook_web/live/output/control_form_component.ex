defmodule LivebookWeb.Output.ControlFormComponent do
  use LivebookWeb, :live_component

  @impl true
  def mount(socket) do
    {:ok, assign(socket, data: %{})}
  end

  @impl true
  def update(assigns, socket) do
    prev_data = socket.assigns.data

    socket = assign(socket, assigns)

    data =
      Map.new(assigns.attrs.fields, fn {field, input_attrs} ->
        {field, assigns.input_views[input_attrs.id].value}
      end)

    if data != prev_data do
      change_data =
        for {field, value} <- data,
            assigns.attrs.report_changes[field],
            into: %{},
            do: {field, value}

      if change_data != %{} do
        report_event(socket, %{type: :change, data: change_data})
      end
    end

    {:ok, assign(socket, data: data)}
  end

  @impl true
  def render(%{attrs: %{type: :form}} = assigns) do
    ~H"""
    <div class="flex flex-col space-y-3">
      <.live_component
        :for={{_field, input_attrs} <- @attrs.fields}
        module={LivebookWeb.Output.InputComponent}
        id={"#{@id}-#{input_attrs.id}"}
        attrs={input_attrs}
        input_views={@input_views}
        session_pid={@session_pid}
        client_id={@client_id}
        local={true}
      />
      <div :if={@attrs.submit}>
        <button class="button-base button-blue" type="button" phx-click="submit" phx-target={@myself}>
          <%= @attrs.submit %>
        </button>
      </div>
    </div>
    """
  end

  @impl true
  def handle_event("submit", %{}, socket) do
    report_event(socket, %{type: :submit, data: socket.assigns.data})

    if socket.assigns.attrs.reset_on_submit do
      reset_inputs(socket)
    end

    {:noreply, socket}
  end

  defp report_event(socket, attrs) do
    topic = socket.assigns.attrs.ref
    event = Map.merge(%{origin: socket.assigns.client_id}, attrs)
    send(socket.assigns.attrs.destination, {:event, topic, event})
  end

  defp reset_inputs(socket) do
    values =
      for {field, input_attrs} <- socket.assigns.attrs.fields,
          field in socket.assigns.attrs.reset_on_submit,
          do: {input_attrs.id, input_attrs.default}

    send(self(), {:set_input_values, values, true})
  end
end
