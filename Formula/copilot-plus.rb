# Place this file in a GitHub repo named: Errr0rr404/homebrew-copilot-plus
# Users install with:
#   brew tap Errr0rr404/copilot-plus
#   brew install copilot-plus

class CopilotPlus < Formula
  desc "Voice + screenshot input wrapper for GitHub Copilot CLI"
  homepage "https://github.com/Errr0rr404/copilot-plus"
  url "https://registry.npmjs.org/copilot-plus/-/copilot-plus-1.0.8.tgz"
  # Run `npm view copilot-plus dist.shasum` after publishing and paste the sha256 here
  sha256 "FILL_IN_AFTER_NPM_PUBLISH"
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
        Ctrl+R  →  Start / stop voice recording
        Ctrl+P  →  Take a screenshot (attached as @path)
    EOS
  end

  test do
    output = shell_output("#{bin}/copilot+ --setup 2>&1")
    assert_match "copilot-plus setup", output
  end
end
