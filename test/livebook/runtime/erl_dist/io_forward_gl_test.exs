defmodule Livebook.Runtime.ErlDist.IOForwardGLTest do
  use ExUnit.Case, async: true

  alias Livebook.Runtime.ErlDist.IOForwardGL

  test "forwards requests to sender's group leader" do
    pid = start_supervised!(IOForwardGL)

    group_leader_io =
      ExUnit.CaptureIO.capture_io(:stdio, fn ->
        # This sends an IO request to the IOForwardGL process.
        # Our group leader is :stdio (by default) so we expect
        # it to receive the string.
        IO.puts(pid, "hey")
      end)

    assert group_leader_io == "hey\n"
  end
end
