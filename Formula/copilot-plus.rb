# brew tap Errr0rr404/copilot-plus
# brew install copilot-plus

class CopilotPlus < Formula
  desc "Voice + screenshots + workflows + queue + TTS + history for GitHub Copilot CLI"
  homepage "https://github.com/Errr0rr404/copilot-plus"
  url "https://github.com/Errr0rr404/copilot-plus/archive/refs/tags/v1.2.0.tar.gz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
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

    # Launcher that ensures the Homebrew node is on PATH
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

      Verify everything:
        copilot+ --doctor

      Hotkeys inside copilot+:
        ?  / Ctrl+/         →  in-app cheatsheet
        Ctrl+K              →  command palette (fuzzy search every feature)
        Ctrl+R              →  voice recording
        Ctrl+P              →  screenshot
        Ctrl+Y              →  paste clipboard (text or image)
        Ctrl+G              →  inject smart context (git diff, recent files)
        Ctrl+T              →  toggle text-to-speech
        Ctrl+B              →  bookmark last response
        Option+Shift+1–4    →  switch workhorse model (macOS Terminal.app)
        Ctrl+Shift+1–4      →  switch workhorse model (kitty/WezTerm/Windows Terminal)
        Option+1–9          →  execute prompt macro (macOS Apple Terminal)
        Ctrl+1–9            →  execute prompt macro (CSI u terminals)
        !cmd                →  run shell command, inject output as context

      Tools:
        copilot+ --monitor   →  live multi-session dashboard
        copilot+ --history   →  search past prompts
        copilot+ --snippets  →  browse bookmarked responses
    EOS
  end

  test do
    output = shell_output("#{bin}/copilot+ --version")
    assert_match "copilot-plus", output
  end
end
