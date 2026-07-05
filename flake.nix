{
  description = "caret development flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    terminal-control-src = {
      url = "github:kitlangton/terminal-control";
      flake = false;
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      terminal-control-src,
      ...
    }:
    let
      systems = [
        "aarch64-linux"
        "x86_64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      forEachSystem = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          terminal-control = pkgs.rustPlatform.buildRustPackage rec {
            pname = "terminal-control";
            version = "0.3.1";
            src = terminal-control-src;
            cargoLock = {
              lockFile = "${terminal-control-src}/Cargo.lock";
            };
            nativeBuildInputs = with pkgs; [
              pkg-config
              openssl
            ];
            buildInputs = with pkgs; [
              openssl
            ];
            doCheck = false;
          };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              bun
              nodejs_22
              git
              pkg-config
              openssl
              vips
              stdenv.cc.cc
              terminal-control
            ];

            shellHook = ''
              export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [
                pkgs.vips
                pkgs.glib
                pkgs.stdenv.cc.cc
              ]}"

              echo "caret dev shell"
              echo "  bun run check                    — typecheck, test, lint"
              echo "  bun run --cwd packages/tui dev   — TUI dev"
              echo "  termctrl --help                  — terminal e2e driver"
            '';
          };
        }
      );
    };
}
