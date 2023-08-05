defmodule LivebookWeb.Output.TextComponent do
  use LivebookWeb, :live_component

  @impl true
  def render(assigns) do
    ~H"""
    <div
      id={"virtualized-text-#{@id}"}
      class="relative"
      phx-hook="VirtualizedLines"
      data-max-height="300"
    >
      <% # Add a newline to each element, so that multiple lines can be copied properly %>
      <div data-template class="hidden" id={"virtualized-text-#{@id}-template"} phx-no-format><%= for line <- ansi_string_to_html_lines(@content) do %><div data-line><%= [
      line,
      "\n"
    ] %></div><% end %></div>
      <div
        data-content
        class="overflow-auto whitespace-pre font-editor text-gray-500 tiny-scrollbar"
        id={"virtualized-text-#{@id}-content"}
        phx-update="ignore"
        phx-no-format
      >
      </div>
      <div class="absolute right-2 top-0 z-10">
        <button
          class="icon-button bg-gray-100"
          data-el-clipcopy
          phx-click={JS.dispatch("lb:clipcopy", to: "#virtualized-text-#{@id}-template")}
        >
          <.remix_icon icon="clipboard-line" class="text-lg" />
        </button>
      </div>
    </div>
    """
  end
end
