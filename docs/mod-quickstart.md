# LAB inside MOD: quickstart

One page for installing and checking LAB on a Windows machine with WSL2 and no
internet. Every command runs in the WSL terminal (Ubuntu), not in PowerShell.
Replace `<you>` with your Windows user name and `<version>` with the bundle version.

## 1. Copy the bundle into WSL

Put `lab-harness-<version>-linux-x64.tar.gz` and its `SHA256SUMS` in your Windows
Downloads folder, then copy both onto the Linux filesystem. Do not install or run LAB
from `/mnt/c`, because permissions and sockets do not work there.

```sh
mkdir -p ~/lab-bundle && cd ~/lab-bundle
cp /mnt/c/Users/<you>/Downloads/lab-harness-<version>-linux-x64.tar.gz /mnt/c/Users/<you>/Downloads/SHA256SUMS .
sha256sum -c SHA256SUMS --ignore-missing      # must print: ... OK
```

Stop if the check does not print `OK`. Fetch the file again; never install a bundle
that fails its checksum.

## 2. Install offline

```sh
tar -xzf lab-harness-<version>-linux-x64.tar.gz
```

Run the offline installer from the extracted folder. The exact command is in
[airgap-install.md](airgap-install.md), which is also inside the bundle. It needs no
network and no sudo, and it does not edit your shell profile. It installs into
`~/.local/share/lab-harness/releases/<commit>`, writes the launcher
`~/.local/share/lab-harness/lab` and the command `~/.local/bin/lab`, then runs a
short Herdr check. If `lab` is not found afterwards, add this line to `~/.bashrc`:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

## 3. Proxy and corporate CA (if your network needs them)

Add these lines to `~/.bashrc` and open a new terminal. Use the values from your IT
department. Put no passwords in the proxy URL if you can avoid it.

```sh
export HTTPS_PROXY=http://proxy.example.internal:8080
export NO_PROXY=localhost,127.0.0.1,.example.internal
export NODE_EXTRA_CA_CERTS="$HOME/certs/corp-ca.pem"   # PEM file with the corporate root CA
```

To get the CA, export the corporate root certificate from Windows (`certmgr.msc`,
Base-64 `.cer`), copy it to `~/certs/corp-ca.pem`, and check that it starts with
`-----BEGIN CERTIFICATE-----`.

## 4. Connect the Azure model

```sh
lab --configure
```

Choose the `azure` route. [azure-openai.md](azure-openai.md) explains each field.
You enter:

- **Endpoint:** the Azure OpenAI resource URL (`https://<resource>.openai.azure.com`)
  or the API Management gateway URL that IT gave you.
- **Deployment name** and the **model ID** (for example `gpt-5.1`), plus the API
  version (default `v1`).
- **Authentication**, one of three modes:
  1. an Azure `api-key` header with the resource key;
  2. a custom header name with its value, for a gateway (for example
     `Ocp-Apim-Subscription-Key`);
  3. a bearer token printed by a command (Entra ID), which LAB runs when it needs one.

The key is typed into a hidden prompt and saved in a private file
(`~/.local/share/lab-harness/workspace/key`, mode 0600). It never appears in
arguments or logs. If `--configure` offers no `azure` route, your release predates it,
and the qualification report shows that.

## 5. First launch and five things to try

```sh
cd ~/code/your-project
lab
```

Pi opens on the left and a shell on the right (Ctrl+B, then h or l, switches between
them).

1. **A prompt:** `Summarise this repository in three bullets.`
2. **An edit with approval:** `Add a one-line comment at the top of README.md.` An
   approval prompt shows the change. Choose **Allow once**, then run `git diff` in
   the right pane.
3. **Search:** `/lab-search TODO`
4. **Skills:** `/lab-skills`
5. **A second session:** open a second WSL terminal, `cd` to the same project, and run
   `lab`. Run `/relay-peers` in both. In the first, run
   `/relay-send <peer-from-the-list> intro-1 Hello`. In the second, run `/relay-inbox`.

Leave with `/exit`.

## 6. Run the qualification and share the report

```sh
REL=$(sed -n "s#^exec '\(.*\)/lab' \"\$@\"\$#\1#p" ~/.local/share/lab-harness/lab)
sh "$REL/scripts/qualify-airgap.sh"                    # checks only, no model call
sh "$REL/scripts/qualify-airgap.sh" --model-test       # plus ONE tiny prompt to the model
sh "$REL/scripts/qualify-airgap.sh" --browser-test     # plus the Edge round trip (when supported)
```

Each line prints PASS, FAIL, WARN, SKIPPED or INFO, and the run ends with a summary.
The exit code is 1 if anything failed. The report is saved to
`~/.local/share/lab-harness/qualification/<UTC time>/report.txt` and `report.json`.
It contains no keys, tokens, proxy passwords or your user name, so you can copy it
out of MOD, for example with
`cp -r ~/.local/share/lab-harness/qualification/<UTC time> /mnt/c/Users/<you>/Downloads/`.
[airgap-qualification.md](airgap-qualification.md) explains every check and what to
do when it fails.

## 7. Roll back or uninstall

Each release is installed side by side under `releases/<commit>`. **To roll back**,
run the installer from the previous bundle again; the launcher then points to that
release. **To uninstall**, use the uninstall command described in
[airgap-install.md](airgap-install.md). It removes only files that LAB owns. To do it
by hand:

```sh
# Remove ~/.local/bin/lab only if this prints: # LAB-HARNESS owned command shim
sed -n 2p ~/.local/bin/lab
rm ~/.local/bin/lab ~/.local/share/lab-harness/lab
rm -rf ~/.local/share/lab-harness/releases
# Optional, removes your saved route, key, sessions and reports:
rm -rf ~/.local/share/lab-harness/workspace ~/.local/share/lab-harness/qualification
```
