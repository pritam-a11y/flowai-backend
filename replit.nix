{ pkgs }: {
  deps = [
    pkgs.nodejs_18
    pkgs.nodePackages.typescript-language-server
    pkgs.postgresql
  ];
}