# brew tap Errr0rr404/copilot-plus
# brew install copilot-plus

class CopilotPlus < Formula
  desc "Voice + screenshot input wrapper for GitHub Copilot CLI"
  homepage "https://github.com/Errr0rr404/copilot-plus"
  url "https://github.com/Errr0rr404/copilot-plus/archive/refs/tags/v1.0.21.tar.gz"
  sha256 "df0772bef8c56a7ab4f8d3eb1bf84460df5a60fa25925fc79f5d327311a57a01"
  license "MIT"

  depends_on "node"
  depends_on "ffmpeg"
  depends_on "whisper-cpp"

  def install
    system "npm", "install", "--production", "--ignore-scripts"

    # node-pty ships prebuilt binaries without the executable bit — fix that
    Dir["node_modules/node-pty/prebuilds/darwin-*/spawn-helper",
        "node_modules/node-pty/prebuilds/darwin-*/pty.node"].each do |f|
      chmod 0755, f
    end

    libexec.install Dir["*"]

    # Write a launcher that ensures the Homebrew node is on PATH
    (bin/"copilot+").write_env_script libexec/"bin/copilot+",
      PATH: "#{Formula["node"].opt_bin}:$PATH"
  end

  def caveats
    <<~EOS
      Download a Whisper speech model (required for voice input):
        whisper-cpp-download-ggml-model base.en

      Or download directly:
        mkdir -p ~/.copilot/models
        curl -L https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin \\
          -o ~/.copilot/models/ggml-base.en.bin

      Then verify your setup:
        copilot+ --setup

      Hotkeys inside copilot+:
        Ctrl+R         →  Start / stop voice recording
        Ctrl+P         →  Take a screenshot (attached as @path)
        Ctrl+K         →  Open command palette
        Option+1–9     →  Execute a prompt macro (macOS Apple Terminal)
        Ctrl+1–9       →  Execute a prompt macro (kitty/WezTerm/Windows Terminal)
    EOS
  end

  test do
    output = shell_output("#{bin}/copilot+ --setup 2>&1")
    assert_match "copilot-plus setup", output
  end
end
