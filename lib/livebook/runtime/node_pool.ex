defmodule Livebook.Runtime.NodePool do
  use GenServer

  @moduledoc false

  # A pool with generated node names.
  #
  # The names are randomly generated, however to avoid atom exhaustion
  # unused names return back to the pool and can be reused later.

  @default_time 60_000

  # Client interface

  @doc """
  Starts the GenServer from a Supervision tree

  ## Options

    * `:name` - the name to register the pool process under. Defaults
      to `Livebook.Runtime.NodePool`

    * `:buffer_time` - the time that is awaited before a disconnected
      node's name is added to pool. Defaults to 1 minute

  """
  def start_link(opts) do
    name = opts[:name] || __MODULE__
    buffer_time = opts[:buffer_time] || @default_time

    GenServer.start_link(
      __MODULE__,
      %{buffer_time: buffer_time},
      name: name
    )
  end

  @doc """
  Returns a node name.

  Generates a new name if pool is empty, or takes one from pool.
  """
  def get_name(server \\ __MODULE__, basename) do
    GenServer.call(server, {:get_name, basename})
  end

  # Server side code

  @impl GenServer
  def init(opts) do
    :net_kernel.monitor_nodes(true, node_type: :all)
    {:ok, %{buffer_time: opts.buffer_time, generated_names: MapSet.new(), free_names: []}}
  end

  @impl GenServer
  def handle_call({:get_name, basename}, _, state) do
    {name, new_state} = name(state, basename)
    {:reply, name, new_state}
  end

  @impl GenServer
  def handle_info({:nodedown, node, _info}, state) do
    case state.buffer_time do
      0 -> send(self(), {:add_node, node})
      t -> Process.send_after(self(), {:add_node, node}, t)
    end

    {:noreply, state}
  end

  @impl GenServer
  def handle_info({:nodeup, _node, _info}, state) do
    {:noreply, state}
  end

  @impl GenServer
  def handle_info({:add_node, node}, state) do
    {:noreply, add_node(state, node)}
  end

  # Helper functions

  defp name(state, basename) do
    if Enum.empty?(state.free_names) do
      generate_name(state, basename)
    else
      get_existing_name(state)
    end
  end

  defp generate_name(state, basename) do
    new_name = :"#{Livebook.Utils.random_short_id()}-#{basename}"
    generated_names = MapSet.put(state.generated_names, new_name)
    {new_name, %{state | generated_names: generated_names}}
  end

  defp get_existing_name(state) do
    [name | free_names] = state.free_names
    {name, %{state | free_names: free_names}}
  end

  defp add_node(state, node) do
    if MapSet.member?(state.generated_names, node) do
      free_names = [node | state.free_names]
      %{state | free_names: free_names}
    else
      state
    end
  end
end
