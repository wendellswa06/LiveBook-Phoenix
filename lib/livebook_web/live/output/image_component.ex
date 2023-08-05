defmodule LivebookWeb.Output.ImageComponent do
  use LivebookWeb, :live_component

  @impl true
  def render(assigns) do
    ~H"""
    <img
      class="max-h-[500px]"
      src={data_url(@content, @mime_type)}
      alt="output image"
      id={@id}
      phx-hook="ImageOutput"
    />
    """
  end

  defp data_url(content, mime_type) do
    image_base64 = Base.encode64(content)
    ["data:", mime_type, ";base64,", image_base64]
  end
end
