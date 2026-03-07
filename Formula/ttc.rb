# Place this file in a GitHub repo named: Errr0rr404/homebrew-ttc
# Users install with:
#   brew tap Errr0rr404/ttc
#   brew install ttc

class Ttc < Formula
  desc "Voice + screenshot input wrapper for GitHub Copilot CLI"
  homepage "https://github.com/Errr0rr404/talk-to-copilot"
  url "https://registry.npmjs.org/talk-to-copilot/-/talk-to-copilot-1.0.0.tgz"
  # Run `npm view talk-to-copilot dist.shasum` after publishing and paste the sha256 here
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
    (bin/"ttc").write_env_script libexec/"bin/ttc",
      PATH: "#{Formula["node"].opt_bin}:$PATH"
  end

  def caveats
    <<~EOS
      Download a Whisper speech model (required for voice input):
        whisper-cpp-download-ggml-model base.en

      Then verify your setup:
        ttc --setup

      Hotkeys inside ttc:
        Ctrl+R  →  Start / stop voice recording
        Ctrl+P  →  Take a screenshot (attached as @path)
    EOS
  end

  test do
    output = shell_output("#{bin}/ttc --setup 2>&1")
    assert_match "talk-to-copilot setup", output
  end
end
