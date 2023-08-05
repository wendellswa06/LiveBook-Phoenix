defmodule Livebook.JSInteropTest do
  use ExUnit.Case, async: true

  alias Livebook.{JSInterop, Delta}

  describe "apply_delta_to_string/2" do
    test "prepend" do
      string = "cats"
      delta = Delta.new() |> Delta.insert("fat ")
      assert JSInterop.apply_delta_to_string(delta, string) == "fat cats"
    end

    test "insert in the middle" do
      string = "cats"
      delta = Delta.new() |> Delta.retain(3) |> Delta.insert("'")
      assert JSInterop.apply_delta_to_string(delta, string) == "cat's"
    end

    test "delete" do
      string = "cats"
      delta = Delta.new() |> Delta.retain(1) |> Delta.delete(2)
      assert JSInterop.apply_delta_to_string(delta, string) == "cs"
    end

    test "replace" do
      string = "cats"
      delta = Delta.new() |> Delta.retain(1) |> Delta.delete(2) |> Delta.insert("ar")
      assert JSInterop.apply_delta_to_string(delta, string) == "cars"
    end

    test "retain skips the given number UTF-16 code units" do
      # 🚀 consists of 2 UTF-16 code units, so JavaScript assumes "🚀".length is 2
      string = "🚀 cats"
      # Skip the emoji (2 code unit) and the space (1 code unit)
      delta = Delta.new() |> Delta.retain(3) |> Delta.insert("my ")
      assert JSInterop.apply_delta_to_string(delta, string) == "🚀 my cats"
    end

    test "delete removes the given number UTF-16 code units" do
      # 🚀 consists of 2 UTF-16 code units, so JavaScript assumes "🚀".length is 2
      string = "🚀 cats"
      delta = Delta.new() |> Delta.delete(2)
      assert JSInterop.apply_delta_to_string(delta, string) == " cats"
    end
  end

  describe "diff/2" do
    test "insert" do
      assert JSInterop.diff("cats", "cat's") ==
               Delta.new() |> Delta.retain(3) |> Delta.insert("'")
    end

    test "delete" do
      assert JSInterop.diff("cats", "cs") ==
               Delta.new() |> Delta.retain(1) |> Delta.delete(2)
    end

    test "replace" do
      assert JSInterop.diff("cats", "cars") ==
               Delta.new() |> Delta.retain(2) |> Delta.delete(1) |> Delta.insert("r")
    end

    test "retain skips the given number UTF-16 code units" do
      assert JSInterop.diff("🚀 cats", "🚀 my cats") ==
               Delta.new() |> Delta.retain(3) |> Delta.insert("my ")
    end

    test "delete removes the given number UTF-16 code units" do
      assert JSInterop.diff("🚀 cats", " cats") ==
               Delta.new() |> Delta.delete(2)
    end
  end

  describe "js_column_to_elixir/2" do
    test "keeps the column as is for ASCII characters" do
      column = 4
      line = "String.replace"
      assert JSInterop.js_column_to_elixir(column, line) == 4
    end

    test "shifts the column given characters spanning multiple UTF-16 code units" do
      # 🚀 consists of 2 UTF-16 code units, so JavaScript assumes "🚀".length is 2
      column = 7
      line = "🚀🚀 String.replace"
      assert JSInterop.js_column_to_elixir(column, line) == 5
    end

    test "returns proper column if a middle UTF-16 code unit is given" do
      # 🚀 consists of 2 UTF-16 code units, so JavaScript assumes "🚀".length is 2
      # 3th and 4th code unit correspond to the second 🚀
      column = 3
      line = "🚀🚀 String.replace"
      assert JSInterop.js_column_to_elixir(column, line) == 2
    end
  end

  describe "elixir_column_to_js/2" do
    test "keeps the column as is for ASCII characters" do
      column = 4
      line = "String.replace"
      assert JSInterop.elixir_column_to_js(column, line) == 4
    end

    test "shifts the column given characters spanning multiple UTF-16 code units" do
      # 🚀 consists of 2 UTF-16 code units, so JavaScript assumes "🚀".length is 2
      column = 5
      line = "🚀🚀 String.replace"
      assert JSInterop.elixir_column_to_js(column, line) == 7
    end
  end
end
