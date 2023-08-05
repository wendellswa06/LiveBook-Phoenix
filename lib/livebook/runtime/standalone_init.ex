defmodule Livebook.Runtime.StandaloneInit do
  @moduledoc false

  # Generic functionality related to starting and setting up
  # a new Elixir system process. It's used by ElixirStandalone.

  alias Livebook.Runtime.NodePool

  @doc """
  Returns a random name for a dynamically spawned node.
  """
  @spec child_node_name(atom()) :: atom()
  def child_node_name(parent) do
    NodePool.get_name(parent)
  end

  @doc """
  Tries locating Elixir executable in PATH.
  """
  @spec find_elixir_executable() :: {:ok, String.t()} | {:error, String.t()}
  def find_elixir_executable() do
    case System.find_executable("elixir") do
      nil -> {:error, "no Elixir executable found in PATH"}
      path -> {:ok, path}
    end
  end

  @doc """
  A list of common flags used for spawned Elixir runtimes.
  """
  @spec elixir_flags(node()) :: list()
  def elixir_flags(node_name) do
    [
      if(Livebook.Config.longname(), do: "--name", else: "--sname"),
      to_string(node_name),
      "--erl",
      # Minimize schedulers busy wait threshold,
      # so that they go to sleep immediately after evaluation.
      # Increase the default stack for dirty io threads (cuda requires it).
      # Enable ANSI escape codes as we handle them with HTML.
      # Disable stdin, so that the system process never tries to read
      # any input from the terminal.
      "+sbwt none +sbwtdcpu none +sbwtdio none +sssdio 128 -elixir ansi_enabled true -noinput",
      # Make the node hidden, so it doesn't automatically join the cluster
      "--hidden",
      # Use the cookie in Livebook
      "--cookie",
      Atom.to_string(Node.get_cookie())
    ]
  end

  # ---
  #
  # Once the new node is spawned we need to establish a connection,
  # initialize it and make sure it correctly reacts to the parent node terminating.
  #
  # The procedure goes as follows:
  #
  # 1. The child sends {:node_initialized, ref} message to the parent
  #    to communicate it's ready for initialization.
  #
  # 2. The parent initializes the child node - loads necessary modules,
  #    starts the NodeManager process and a single RuntimeServer process.
  #
  # 3. The parent sends {:node_initialized, ref} message back to the child,
  #    to communicate successful initialization.
  #
  # 4. The child starts monitoring the NodeManager process and freezes
  #    until the NodeManager process terminates. The NodeManager process
  #    serves as the leading remote process and represents the node from now on.
  #
  # The nodes either successfully go through this flow or return an error,
  # either if the other node dies or is not responding for too long.
  #
  # ---

  @doc """
  Performs the parent side of the initialization contract.

  Should be called by the initializing process on the parent node.

  ## Options

    * `:init_opts` - see `Livebook.Runtime.ErlDist.initialize/2`

  """
  @spec parent_init_sequence(node(), port(), keyword()) :: {:ok, pid()} | {:error, String.t()}
  def parent_init_sequence(child_node, port, opts \\ []) do
    port_ref = Port.monitor(port)

    loop = fn loop ->
      receive do
        {:node_started, init_ref, ^child_node, primary_pid} ->
          Port.demonitor(port_ref)

          server_pid = Livebook.Runtime.ErlDist.initialize(child_node, opts[:init_opts] || [])

          send(primary_pid, {:node_initialized, init_ref})

          {:ok, server_pid}

        {^port, {:data, _output}} ->
          loop.(loop)

        {:DOWN, ^port_ref, :port, _object, _reason} ->
          {:error, "Elixir terminated unexpectedly, please check the terminal for errors"}
      after
        # Use a longer timeout to account for longer child node startup.
        30_000 ->
          {:error, "connection timed out"}
      end
    end

    loop.(loop)
  end

  # Note Windows does not handle escaped quotes and newlines the same way as Unix,
  # so the string cannot have constructs newlines nor strings. That's why we pass
  # the parent node name as ARGV and write the code avoiding newlines.
  @child_node_eval_string """
  [parent_node] = System.argv();\
  init_ref = make_ref();\
  parent_process = {node(), String.to_atom(parent_node)};\
  send(parent_process, {:node_started, init_ref, node(), self()});\
  receive do {:node_initialized, ^init_ref} ->\
    manager_ref = Process.monitor(Livebook.Runtime.ErlDist.NodeManager);\
    receive do {:DOWN, ^manager_ref, :process, _object, _reason} -> :ok end;\
  after 10_000 ->\
    :timeout;\
  end\
  """

  if @child_node_eval_string =~ "\n" do
    raise "invalid @child_node_eval_string, newline found: #{inspect(@child_node_eval_string)}"
  end

  @doc """
  Performs the child side of the initialization contract.

  This function returns AST that should be evaluated in primary
  process on the newly spawned child node. The executed code expects
  the parent_node on ARGV. The process on the parent node is assumed
  to have the same name as the child node.
  """
  def child_node_eval_string(), do: @child_node_eval_string
end
