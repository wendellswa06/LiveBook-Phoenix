defmodule Livebook.Utils.UniqueTaskTest do
  use ExUnit.Case, async: true

  alias Livebook.Utils.UniqueTask

  test "run/2 only awaits existing function call when the given key is taken", %{test: test} do
    parent = self()

    fun = fn ->
      send(parent, {:ping_from_task, self()})

      receive do
        :pong -> :ok
      end
    end

    spawn_link(fn ->
      result = UniqueTask.run("#{test}-key1", fun)
      send(parent, {:result1, result})
    end)

    spawn_link(fn ->
      result = UniqueTask.run("#{test}-key1", fun)
      send(parent, {:result2, result})
    end)

    assert_receive {:ping_from_task, task_pid}
    refute_receive {:ping_from_task, _other_task_pid}, 5
    # The function should be evaluated only once
    send(task_pid, :pong)

    assert_receive {:result1, :ok}
    assert_receive {:result2, :ok}
  end

  test "run/2 runs functions in parallel when different have different keys", %{test: test} do
    parent = self()

    fun = fn ->
      send(parent, {:ping_from_task, self()})

      receive do
        :pong -> :ok
      end
    end

    spawn_link(fn ->
      result = UniqueTask.run("#{test}-key1", fun)
      send(parent, {:result1, result})
    end)

    spawn_link(fn ->
      result = UniqueTask.run("#{test}-key2", fun)
      send(parent, {:result2, result})
    end)

    assert_receive {:ping_from_task, task1_pid}
    assert_receive {:ping_from_task, task2_pid}

    send(task1_pid, :pong)
    send(task2_pid, :pong)

    assert_receive {:result1, :ok}
    assert_receive {:result2, :ok}
  end
end
