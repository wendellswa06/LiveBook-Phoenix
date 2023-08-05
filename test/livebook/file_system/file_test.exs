defmodule Livebook.FileSystem.FileTest do
  use ExUnit.Case, async: true

  import Livebook.TestHelpers

  alias Livebook.FileSystem

  describe "new/2" do
    test "raises an error when a relative path is given" do
      file_system = FileSystem.Local.new()

      assert_raise ArgumentError, ~s{expected an expanded absolute path, got: "file.txt"}, fn ->
        FileSystem.File.new(file_system, "file.txt")
      end
    end

    test "raises an error when a unexpanded path is given" do
      file_system = FileSystem.Local.new()

      assert_raise ArgumentError,
                   ~s{expected an expanded absolute path, got: "#{p("/dir/nested/../file.txt")}"},
                   fn ->
                     FileSystem.File.new(file_system, p("/dir/nested/../file.txt"))
                   end
    end

    test "uses default file system path if non is given" do
      default_path = p("/dir/")
      file_system = FileSystem.Local.new(default_path: default_path)
      assert %FileSystem.File{path: ^default_path} = FileSystem.File.new(file_system)
    end
  end

  describe "local/1" do
    test "uses the globally configured local file system instance" do
      assert FileSystem.File.local(p("/path")).file_system == Livebook.Config.local_file_system()
    end
  end

  describe "relative/2" do
    test "ignores the file path if an absolute path is given" do
      file_system = FileSystem.Local.new()
      file = FileSystem.File.new(file_system, p("/dir/nested/file.txt"))

      assert %FileSystem.File{file_system: ^file_system, path: p("/other/file.txt")} =
               FileSystem.File.resolve(file, p("/other/file.txt"))
    end

    test "resolves a relative path against a regular file" do
      file_system = FileSystem.Local.new()
      file = FileSystem.File.new(file_system, p("/dir/nested/file.txt"))

      assert %FileSystem.File{file_system: ^file_system, path: p("/dir/other/other_file.txt")} =
               FileSystem.File.resolve(file, "../other/other_file.txt")
    end

    test "resolves a relative path against a directory file" do
      file_system = FileSystem.Local.new()
      dir = FileSystem.File.new(file_system, p("/dir/nested/"))

      assert %FileSystem.File{file_system: ^file_system, path: p("/dir/nested/file.txt")} =
               FileSystem.File.resolve(dir, "file.txt")
    end

    test "resolves a relative directory path" do
      file_system = FileSystem.Local.new()
      file = FileSystem.File.new(file_system, p("/dir/nested/file.txt"))

      assert %FileSystem.File{file_system: ^file_system, path: p("/dir/other/")} =
               FileSystem.File.resolve(file, "../other/")

      assert %FileSystem.File{file_system: ^file_system, path: p("/dir/nested/")} =
               FileSystem.File.resolve(file, ".")

      assert %FileSystem.File{file_system: ^file_system, path: p("/dir/")} =
               FileSystem.File.resolve(file, "..")
    end
  end

  describe "dir?/1" do
    test "returns true if file path has a trailing slash" do
      file_system = FileSystem.Local.new()

      dir = FileSystem.File.new(file_system, p("/dir/"))
      assert FileSystem.File.dir?(dir)

      file = FileSystem.File.new(file_system, p("/dir/file.txt"))
      refute FileSystem.File.dir?(file)
    end
  end

  describe "regular?/1" do
    test "returns true if file path has no trailing slash" do
      file_system = FileSystem.Local.new()

      dir = FileSystem.File.new(file_system, p("/dir/"))
      refute FileSystem.File.regular?(dir)

      file = FileSystem.File.new(file_system, p("/dir/file.txt"))
      assert FileSystem.File.regular?(file)
    end
  end

  describe "name/1" do
    test "returns path basename" do
      file_system = FileSystem.Local.new()

      dir = FileSystem.File.new(file_system, p("/dir/"))
      assert FileSystem.File.name(dir) == "dir"

      file = FileSystem.File.new(file_system, p("/dir/file.txt"))
      assert FileSystem.File.name(file) == "file.txt"
    end
  end

  describe "containing_dir/1" do
    test "given a directory, returns the parent directory" do
      file_system = FileSystem.Local.new()

      dir = FileSystem.File.new(file_system, p("/parent/dir/"))

      assert FileSystem.File.new(file_system, p("/parent/")) ==
               FileSystem.File.containing_dir(dir)
    end

    test "given a file, returns the containing directory" do
      file_system = FileSystem.Local.new()

      file = FileSystem.File.new(file_system, p("/dir/file.txt"))
      assert FileSystem.File.new(file_system, p("/dir/")) == FileSystem.File.containing_dir(file)
    end

    test "given the root directory, returns itself" do
      file_system = FileSystem.Local.new()

      file = FileSystem.File.new(file_system, p("/"))
      assert file == FileSystem.File.containing_dir(file)
    end
  end

  # Note: file system operations are thoroughly tested for
  # each file system separately, so here we only test the
  # FileSystem.File interface, rather than the various edge
  # cases

  describe "list/1" do
    @tag :tmp_dir
    test "lists files in the given directory", %{tmp_dir: tmp_dir} do
      create_tree!(tmp_dir,
        dir: [
          nested: [
            "file.txt": "content"
          ]
        ],
        file: "content",
        "file.txt": "content"
      )

      dir = FileSystem.File.local(tmp_dir <> "/")

      assert {:ok, files} = FileSystem.File.list(dir)

      assert files |> Enum.sort() == [
               FileSystem.File.resolve(dir, "dir/"),
               FileSystem.File.resolve(dir, "file"),
               FileSystem.File.resolve(dir, "file.txt")
             ]
    end

    @tag :tmp_dir
    test "includes nested files when called with the :recursive option", %{tmp_dir: tmp_dir} do
      create_tree!(tmp_dir,
        dir: [
          nested: [
            double_nested: [],
            "file.txt": "content"
          ]
        ],
        file: "content",
        "file.txt": "content"
      )

      dir = FileSystem.File.local(tmp_dir <> "/")

      assert {:ok, files} = FileSystem.File.list(dir, recursive: true)

      assert files |> Enum.sort() == [
               FileSystem.File.resolve(dir, "dir/"),
               FileSystem.File.resolve(dir, "dir/nested/"),
               FileSystem.File.resolve(dir, "dir/nested/double_nested/"),
               FileSystem.File.resolve(dir, "dir/nested/file.txt"),
               FileSystem.File.resolve(dir, "file"),
               FileSystem.File.resolve(dir, "file.txt")
             ]
    end
  end

  describe "read/1" do
    @tag :tmp_dir
    test "returns file contents", %{tmp_dir: tmp_dir} do
      create_tree!(tmp_dir,
        dir: [
          "file.txt": "content"
        ]
      )

      path = Path.join(tmp_dir, "dir/file.txt")
      file = FileSystem.File.local(path)

      assert {:ok, "content"} = FileSystem.File.read(file)
    end
  end

  describe "write/2" do
    @tag :tmp_dir
    test "writes file contents", %{tmp_dir: tmp_dir} do
      path = Path.join(tmp_dir, "dir/file.txt")
      file = FileSystem.File.local(path)

      assert :ok = FileSystem.File.write(file, "content")
      assert {:ok, "content"} = FileSystem.File.read(file)
    end
  end

  describe "access/1" do
    @tag :tmp_dir
    test "writes file contents", %{tmp_dir: tmp_dir} do
      create_tree!(tmp_dir,
        dir: [
          "file.txt": "content"
        ]
      )

      path = Path.join(tmp_dir, "dir/file.txt")
      file = FileSystem.File.local(path)

      assert {:ok, :read_write} = FileSystem.File.access(file)
    end
  end

  describe "create_dir/1" do
    @tag :tmp_dir
    test "writes file contents", %{tmp_dir: tmp_dir} do
      path = Path.join(tmp_dir, "dir/nested") <> "/"
      dir = FileSystem.File.local(path)

      assert :ok = FileSystem.File.create_dir(dir)
      assert {:ok, true} = FileSystem.File.exists?(dir)
    end
  end

  describe "remove/1" do
    @tag :tmp_dir
    test "writes file contents", %{tmp_dir: tmp_dir} do
      create_tree!(tmp_dir,
        dir: [
          "file.txt": "content"
        ]
      )

      path = Path.join(tmp_dir, "dir") <> "/"
      dir = FileSystem.File.local(path)

      assert :ok = FileSystem.File.remove(dir)
      assert {:ok, false} = FileSystem.File.exists?(dir)
    end
  end

  describe "copy/2" do
    @tag :tmp_dir
    test "supports regular files from different file systems via stream read and write",
         %{tmp_dir: tmp_dir} do
      bypass = Bypass.open()
      s3_fs = FileSystem.S3.new("http://localhost:#{bypass.port}/mybucket", "key", "secret")
      local_fs = FileSystem.Local.new()

      create_tree!(tmp_dir,
        "src_file.txt": "content"
      )

      src_file = FileSystem.File.new(local_fs, Path.join(tmp_dir, "src_file.txt"))
      dest_file = FileSystem.File.new(s3_fs, "/dest_file.txt")

      # Note: the content is small, so write is a single request
      Bypass.expect_once(bypass, "PUT", "/mybucket/dest_file.txt", fn conn ->
        assert {:ok, "content", conn} = Plug.Conn.read_body(conn)

        Plug.Conn.resp(conn, 200, "")
      end)

      assert :ok = FileSystem.File.copy(src_file, dest_file)
    end

    @tag :tmp_dir
    test "supports directories from different file systems via stream read and write",
         %{tmp_dir: tmp_dir} do
      bypass = Bypass.open()
      s3_fs = FileSystem.S3.new("http://localhost:#{bypass.port}/mybucket", "key", "secret")
      local_fs = FileSystem.Local.new()

      create_tree!(tmp_dir,
        src_dir: [
          nested: [
            "file.txt": "content"
          ],
          "file.txt": "content"
        ]
      )

      src_dir = FileSystem.File.new(local_fs, Path.join(tmp_dir, "src_dir") <> "/")
      dest_dir = FileSystem.File.new(s3_fs, "/dest_dir/")

      # Note: the content is small, so write is a single request
      Bypass.expect_once(bypass, "PUT", "/mybucket/dest_dir/nested/file.txt", fn conn ->
        assert {:ok, "content", conn} = Plug.Conn.read_body(conn)
        Plug.Conn.resp(conn, 200, "")
      end)

      Bypass.expect_once(bypass, "PUT", "/mybucket/dest_dir/file.txt", fn conn ->
        assert {:ok, "content", conn} = Plug.Conn.read_body(conn)
        Plug.Conn.resp(conn, 200, "")
      end)

      assert :ok = FileSystem.File.copy(src_dir, dest_dir)
    end
  end

  describe "rename/2" do
    @tag :tmp_dir
    test "returns an error when files from different file systems are given and the destination file exists",
         %{tmp_dir: tmp_dir} do
      s3_fs = FileSystem.S3.new("https://example.com/mybucket", "key", "secret")
      local_fs = FileSystem.Local.new()

      create_tree!(tmp_dir,
        "dest_file.txt": "content"
      )

      src_file = FileSystem.File.new(s3_fs, "/src_file.txt")
      dest_file = FileSystem.File.new(local_fs, Path.join(tmp_dir, "dest_file.txt"))

      assert {:error, "file already exists"} = FileSystem.File.rename(src_file, dest_file)
    end

    # Rename is implemented as copy and delete, so just a single
    # integration test

    @tag :tmp_dir
    test "supports regular files from different file systems via explicit read, write, delete",
         %{tmp_dir: tmp_dir} do
      bypass = Bypass.open()
      s3_fs = FileSystem.S3.new("http://localhost:#{bypass.port}/mybucket", "key", "secret")
      local_fs = FileSystem.Local.new()

      create_tree!(tmp_dir,
        "src_file.txt": "content"
      )

      src_file = FileSystem.File.new(local_fs, Path.join(tmp_dir, "src_file.txt"))
      dest_file = FileSystem.File.new(s3_fs, "/dest_file.txt")

      # Existence is verified by listing
      Bypass.expect_once(bypass, "GET", "/mybucket", fn conn ->
        assert %{"prefix" => "dest_file.txt", "delimiter" => "/"} = conn.params

        conn
        |> Plug.Conn.put_resp_content_type("application/xml")
        |> Plug.Conn.resp(200, """
        <ListBucketResult>
          <Name>mybucket</Name>
        </ListBucketResult>
        """)
      end)

      Bypass.expect_once(bypass, "PUT", "/mybucket/dest_file.txt", fn conn ->
        assert {:ok, "content", conn} = Plug.Conn.read_body(conn)

        Plug.Conn.resp(conn, 200, "")
      end)

      assert :ok = FileSystem.File.rename(src_file, dest_file)
      assert {:ok, false} = FileSystem.File.exists?(src_file)
    end
  end

  describe "etag_for/1" do
    @tag :tmp_dir
    test "returns different value only when the file is updated", %{tmp_dir: tmp_dir} do
      create_tree!(tmp_dir,
        dir: [
          "file.txt": "content"
        ]
      )

      path = Path.join(tmp_dir, "dir/file.txt")
      file = FileSystem.File.local(path)

      assert {:ok, etag1} = FileSystem.File.etag_for(file)
      assert {:ok, ^etag1} = FileSystem.File.etag_for(file)

      FileSystem.File.write(file, "udptupdate")

      assert {:ok, etag2} = FileSystem.File.etag_for(file)

      assert etag1 != etag2
    end
  end

  describe "exists?/1" do
    @tag :tmp_dir
    test "checks if the file exists", %{tmp_dir: tmp_dir} do
      create_tree!(tmp_dir,
        dir: [
          "file.txt": "content"
        ]
      )

      path = Path.join(tmp_dir, "dir/file.txt")
      file = FileSystem.File.local(path)
      assert {:ok, true} = FileSystem.File.exists?(file)

      path = Path.join(tmp_dir, "dir/nonexistent.txt")
      file = FileSystem.File.local(path)
      assert {:ok, false} = FileSystem.File.exists?(file)
    end
  end

  describe "ensure_extension/2" do
    test "adds extension to the name" do
      file = FileSystem.File.local(p("/file"))

      assert %{path: p("/file.txt")} = FileSystem.File.ensure_extension(file, ".txt")
    end

    test "keeps the name unchanged if it already has the given extension" do
      file = FileSystem.File.local(p("/file.txt"))

      assert %{path: p("/file.txt")} = FileSystem.File.ensure_extension(file, ".txt")
    end

    test "given a directory changes path to empty file name with the given extension" do
      dir = FileSystem.File.local(p("/dir/"))

      assert %{path: p("/dir/.txt")} = FileSystem.File.ensure_extension(dir, ".txt")
    end
  end

  describe "Collectable into" do
    @tag :tmp_dir
    test "uses chunked write to file", %{tmp_dir: tmp_dir} do
      path = Path.join(tmp_dir, "dir/file.txt")
      file = FileSystem.File.local(path)

      chunk = String.duplicate("a", 2048)

      chunk |> List.duplicate(10) |> Enum.into(file)

      assert FileSystem.File.read(file) == {:ok, String.duplicate(chunk, 10)}
    end
  end

  describe "read_stream_into/2" do
    @tag :tmp_dir
    test "collects file contents", %{tmp_dir: tmp_dir} do
      create_tree!(tmp_dir,
        dir: [
          "file.txt": "content"
        ]
      )

      path = Path.join(tmp_dir, "dir/file.txt")
      file = FileSystem.File.local(path)

      assert {:ok, "content"} = FileSystem.File.read_stream_into(file, <<>>)
    end
  end
end
