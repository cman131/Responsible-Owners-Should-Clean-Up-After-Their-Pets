$root = $PSScriptRoot

wt `
  new-tab --title "Server" --startingDirectory $root powershell -NoExit -Command "pnpm --filter @poke-fighter/server dev" `; `
  new-tab --title "Client" --startingDirectory $root powershell -NoExit -Command "pnpm --filter @poke-fighter/client dev"
