# Hosting on a Linux box

How to run this app with Anki and AnkiConnect on a headless Linux server, so cards can be added from a phone. For humans and AI agents. Verified on Debian 13 with Anki 26.09 in September 2026. `<tailscale-ip>` and `<magicdns-name>` stand for the box's Tailscale address and name.

## How it fits together

Anki refuses to run without a display, so it gets a virtual one.

```
Xvfb :99                  virtual X server, draws into memory, nothing on a screen
 └─ Anki                  DISPLAY=:99, opens the profile, syncs with AnkiWeb
     └─ AnkiConnect       add-on, HTTP API on 127.0.0.1:8765
          ▲
   vite dev server        bun run dev --host, port 5180, calls 8765 locally
x11vnc (on demand)        mirrors :99 to a VNC client, Tailscale address only
```

Everything runs as systemd **user** units, root is needed only for the install. The phone comes in over Tailscale. The ufw firewall blocks every other inbound port, so the dev server may listen on all interfaces.

The box is a second Anki client next to the usual one. Both sync with AnkiWeb, which merges normal changes. The server syncs before every add, so the note lookup here sees what the Mac already uploaded. Two adds of the same subject on both machines at the same second can still create two notes. Only a schema change forces a one-way sync, see "Things that bite".

## What you need

- Debian 12+ or Ubuntu 22.04+ on x86_64, Anki needs glibc 2.35+. About 1 GB of free RAM for Anki and its WebEngine helpers, 1 GB of disk
- sudo for `apt` and `loginctl`, nothing else
- Tailscale on the box and the phone, and a firewall that admits only Tailscale, for example ufw with `default deny incoming`, `allow in on tailscale0`, `allow 41641/udp`
- An AnkiWeb account that already holds the collection
- Node 24 and Bun in `~/.local/bin`, and this repo checked out with `data/userdata/` cloned into it. Run `git -C data/userdata config merge.ours.driver true` once in that clone, so a media file that both machines added merges with no conflict, see "Two machines" in `data/userdata/README.md`

## Install

Steps marked **root** need sudo. An AI agent can do the rest.

1. **root** Libraries, the virtual display and VNC. Line one is what Anki's own `install.sh` and its Linux install page list, line two what they miss for Anki 26.09, plus the tools:

   ```bash
   sudo apt install libdbus-1-3 libfontconfig1 libfreetype6 libgl1 libnss3 libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-randr0 libxcb-render-util0 libxcb-shape0 libxcb-xinerama0 libxcb-xkb1 libxcomposite1 libxcursor1 libxi6 libxkbcommon0 libxkbcommon-x11-0 libxrandr2 libxrender1 libxtst6 libglib2.0-0t64 libxcb-cursor0 libwayland-client0 \
     libegl1 libasound2t64 libpulse0 xvfb x11vnc fonts-dejavu-core
   ```

2. **root** Let the user units run without a login session:

   ```bash
   sudo loginctl enable-linger $USER
   ```

3. Anki. Unpack the Linux tarball from https://github.com/ankitects/anki/releases under `~/opt`. Do not run its `install.sh`, the bundle runs in place:

   ```bash
   tar -xaf anki-26.09.2-linux-x86_64.tar.zst -C ~/opt
   mv ~/opt/anki-linux ~/opt/anki-26.09.2
   ln -sfn anki-26.09.2 ~/opt/anki
   ```

4. AnkiConnect. The live repo is on sourcehut, the GitHub one is archived and stale. Its default config binds 127.0.0.1:8765, keep it:

   ```bash
   git clone --depth 1 https://git.sr.ht/~foosoft/anki-connect /tmp/anki-connect
   mkdir -p ~/.local/share/Anki2/addons21
   cp -r /tmp/anki-connect/plugin ~/.local/share/Anki2/addons21/AnkiConnect
   ```

5. Copy the three unit files below to `~/.config/systemd/user/`, then:

   ```bash
   systemctl --user daemon-reload
   systemctl --user enable --now xvfb-anki anki
   ```

6. A VNC password, 8 characters at most, the protocol ignores the rest. macOS Screen Sharing refuses a server without one:

   ```bash
   x11vnc -storepasswd ~/.vnc/anki-vnc.passwd
   ```

7. First run, by a human over VNC. `systemctl --user start anki-vnc`, connect to `vnc://<tailscale-ip>:5900`. Answer the language dialog. Click Sync, log in to AnkiWeb, choose **Download from AnkiWeb**, the local collection is empty. In Preferences turn off the automatic update check, or its dialog will sit on the hidden screen later. `systemctl --user stop anki-vnc` when done, it stops itself after an hour anyway.

8. Check that AnkiConnect answers and the profile is logged in:

   ```bash
   curl 127.0.0.1:8765 -d '{"action":"version","version":6}'      # {"result": 6, "error": null}
   curl 127.0.0.1:8765 -d '{"action":"sync","version":6}'         # {"result": null, "error": null}
   ```

9. The app. `bun install` in the repo, then `scp` `.env` and `scripts/.env` from the main machine. `.env` holds the three Azure TTS values and is required. Without one of them the dev server still starts, but the first API request fails, and the dev server log names the missing variable. Keep `AZURE_TTS_VOICES` the same on both machines: the voice is part of the sentence clip name, so a different list makes each machine create its own clip for most words.

## Unit files

`xvfb-anki.service`. `-fbdir` keeps a copy of the screen in `$XDG_RUNTIME_DIR/xvfb/Xvfb_screen0`, see "For AI agents":

```ini
[Unit]
Description=Virtual X display for headless Anki

[Service]
ExecStartPre=/bin/mkdir -p %t/xvfb
ExecStart=/usr/bin/Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp -fbdir %t/xvfb
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
```

`anki.service`. Anki treats SIGTERM as a clean close, it saves and syncs before it exits:

```ini
[Unit]
Description=Anki desktop (headless, serves AnkiConnect on 127.0.0.1:8765)
Requires=xvfb-anki.service
After=xvfb-anki.service

[Service]
Environment=DISPLAY=:99
ExecStart=%h/opt/anki/anki
TimeoutStopSec=90
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

`anki-vnc.service`. Not enabled, started by hand. All three IPv6 flags are needed, without them x11vnc also listens on `[::]:5900`, every IPv6 address of the box:

```ini
[Unit]
Description=VNC view of the headless Anki display, Tailscale interface only (start by hand, stops after 1h)
Requires=xvfb-anki.service
After=xvfb-anki.service

[Service]
ExecStart=/usr/bin/x11vnc -display :99 -listen <tailscale-ip> -noipv6 -no6 -rfbportv6 0 -rfbport 5900 -rfbauth %h/.vnc/anki-vnc.passwd -forever -shared -noxdamage
RuntimeMaxSec=1h
Restart=no
```

## Run the dev server

In tmux or screen, so it outlives the SSH connection:

```bash
bun run dev --host --port 5180 --strictPort
```

`--host` listens on all interfaces, safe only behind the firewall. `--host <tailscale-ip>` binds that address alone and needs none. The pinned port keeps the URL stable when other dev servers hold the ports vite would pick.

On the phone: `http://<magicdns-name>:5180/`. Client and API share that origin, so the CORS list in `src/server/app.ts` does not matter here.

## Day to day

```bash
systemctl --user status anki xvfb-anki      # what is running
systemctl --user restart anki               # restart Anki alone
systemctl --user stop anki                  # stop Anki, the display keeps running
systemctl --user start xvfb-anki anki       # bring both back
systemctl --user start anki-vnc             # open VNC for an hour
journalctl --user -u anki -f                # follow Anki's log
free -m                                     # Anki takes about 570 MB
```

Stop `anki` before you stop or restart `xvfb-anki`. Stopping the display kills Anki mid-write, which once corrupted `prefs21.db`.

## Things that bite

- **Missing library.** The Anki journal shows `ImportError: libXXX.so: cannot open shared object file`. `ldd ~/opt/anki/app_packages/PyQt6/*.abi3.so | grep "not found"` lists them.
- **Nothing listens on 8765** while Anki runs: a dialog waits on the hidden screen, the language dialog on the first run, an update or sync-conflict dialog later. Look with VNC or a screenshot.
- **`sync` answers "auth not configured"**: the profile is not logged in to AnkiWeb. Log in over VNC, since Anki 24.11 an add-on cannot do it with a password.
- **`sync` answers "Sync status ... not one of"**: a one-way sync is required, usually after `bun run sync-anki-fields` changed the note types. Open VNC, click Sync and choose the direction. Until then every add fails at its first step, before anything is written.
- **VNC shows no password field**, or the client refuses: the unit runs with `-rfbauth`, the client must send the stored password.
- **Upgrading Anki**: unpack the new tarball next to the old one, move the `~/opt/anki` symlink, `systemctl --user restart anki`, check the version with the curl call above.

## For AI agents

- You cannot run `sudo`, log in to AnkiWeb, or create the VNC password. Ask the human for those three and do everything else.
- Never bind AnkiConnect or the dev server to a public address on a box without a firewall. Check `ss -ltn` after every change that opens a port.
- To see the hidden screen without VNC: `$XDG_RUNTIME_DIR/xvfb/Xvfb_screen0` is an XWD file, 32 bits per pixel. ImageMagick converts it with `convert xwd:Xvfb_screen0 screen.png`. A short Python script can do the same, header fields 7, 14, 15 and 16 hold the byte order and the RGB masks.
- To press a key or click there: `xdotool` from apt, or the XTest extension through Python `ctypes` on `libX11.so.6` and `libXtst.so.6`, both installed by the packages above.
- Verify a change with three calls: the `version` and `sync` actions on 8765, and `GET /api/anki-notes?type=vocabulary` on the dev server.
