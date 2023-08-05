defmodule Livebook.Notebook.Cell do
  @moduledoc false

  # Data structure representing a single cell in a notebook.
  #
  # Cell is the smallest structural unit in a notebook, in other words
  # it is a block. Depending on the cell type, it may consist of text
  # content, outputs or a specific UI.

  alias Livebook.Utils
  alias Livebook.Notebook.Cell

  @type id :: Utils.id()

  @type t :: Cell.Markdown.t() | Cell.Code.t() | Cell.Smart.t()

  @type type :: :markdown | :code | :smart

  @type indexed_output :: {non_neg_integer(), Livebook.Runtime.output()}

  @doc """
  Returns an empty cell of the given type.
  """
  @spec new(type()) :: t()
  def new(type)

  def new(:markdown), do: Cell.Markdown.new()
  def new(:code), do: Cell.Code.new()
  def new(:smart), do: Cell.Smart.new()

  @doc """
  Returns an atom representing the type of the given cell.
  """
  @spec type(t()) :: type()
  def type(cell)

  def type(%Cell.Code{}), do: :code
  def type(%Cell.Markdown{}), do: :markdown
  def type(%Cell.Smart{}), do: :smart

  @doc """
  Checks if the given cell can be evaluated.
  """
  @spec evaluable?(t()) :: boolean()
  def evaluable?(cell)

  def evaluable?(%Cell.Code{}), do: true
  def evaluable?(%Cell.Smart{}), do: true
  def evaluable?(_cell), do: false

  @doc """
  Extracts all inputs from the given indexed output.
  """
  @spec find_inputs_in_output(indexed_output()) :: list(input_attrs :: map())
  def find_inputs_in_output(output)

  def find_inputs_in_output({_idx, {:input, attrs}}) do
    [attrs]
  end

  def find_inputs_in_output({_idx, {:control, %{type: :form, fields: fields}}}) do
    Keyword.values(fields)
  end

  def find_inputs_in_output({_idx, {type, outputs, _}}) when type in [:frame, :tabs, :grid] do
    Enum.flat_map(outputs, &find_inputs_in_output/1)
  end

  def find_inputs_in_output(_output), do: []

  @doc """
  Extract all asset infos from the given non-indexed output.
  """
  @spec find_assets_in_output(Livebook.Runtime.output()) :: list(asset_info :: map())
  def find_assets_in_output(output)

  def find_assets_in_output({:js, %{js_view: %{assets: assets_info}}}), do: [assets_info]

  def find_assets_in_output({type, outputs, _}) when type in [:frame, :tabs, :grid] do
    Enum.flat_map(outputs, &find_assets_in_output/1)
  end

  def find_assets_in_output(_), do: []

  @setup_cell_id "setup"

  @doc """
  Checks if the given cell is the setup code cell.
  """
  @spec setup?(t()) :: boolean()
  def setup?(cell)

  def setup?(%Cell.Code{id: @setup_cell_id}), do: true
  def setup?(_cell), do: false

  @doc """
  The fixed identifier of the setup cell.
  """
  @spec setup_cell_id() :: id()
  def setup_cell_id(), do: @setup_cell_id

  @doc """
  Checks if the given term is a file input value (info map).
  """
  defguard is_file_input_value(value)
           when is_map_key(value, :file_ref) and is_map_key(value, :client_name)
end
