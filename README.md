# HelmetCam

An iPhone app for helmet cameras that record a ride as dozens of short clips.
HelmetCam connects to the camera over its own Wi-Fi, downloads the clips, and joins a whole day
into **one continuous video**, without re-encoding and without FFmpeg.

Built with Expo, React Native and TypeScript, plus two native Swift modules.
Developed and tested against a FreeConn R3.

> An independent project, not affiliated with FreeConn or any camera vendor.

## Features

- **Clip library.** Recordings grouped by day, on the camera and on the phone, available offline once downloaded.
- **Downloads.** Up to four at a time, with live speed, and a stop button per clip and per day.
- **One video per day.** A day of MPEG-TS clips becomes a single MP4, saved straight to Photos or shared anywhere.
- **Camera controls.** Start and stop recording, take a photo, sync the clock, toggle microphone and date stamp, read battery, storage and firmware, delete clips, format the card.
- **Bluetooth inspector.** Scan for Bluetooth LE devices, list their services, and show the active Bluetooth audio route.

## How it works

```
┌────────────┐   HTTP over the camera's Wi-Fi   ┌──────────────────────┐
│   Camera   │ ───────────────────────────────▶ │  src/camera          │
│ 192.168.1. │   file list, clips, commands     │  client · downloads  │
│    254     │                                  └──────────┬───────────┘
└────────────┘                                             │ .ts clips
                                                ┌──────────▼───────────┐
                                                │  modules/ts-merge    │
                                                │  Swift remuxer       │
                                                └──────────┬───────────┘
                                                           │ one .mp4
                                                        Photos
```

**The camera is a small web server.** It creates its own Wi-Fi network and answers plain HTTP.
Commands are numbered requests that reply in XML. The protocol comes from the Novatek chipset and
is shared by many action and dash cameras. See [docs/camera-protocol.md](docs/camera-protocol.md).

**Clips are joined by remuxing, not re-encoding.** The camera records H.264 video and AAC audio in
MPEG-TS containers. A Swift module parses the transport stream, extracts the encoded frames, and
writes them into one MP4 with `AVAssetWriter`. Quality is untouched and the join runs at disk speed.
See [docs/joining-clips.md](docs/joining-clips.md).

## Project structure

```
src/
  app/            Screens (Expo Router): index (Home), controls, bluetooth
  camera/         Camera HTTP client, clip grouping, downloads, day join
  components/     Shared UI: Screen, Card, Button, ClipRow, DayHeader, ConnectionCard
  hooks/          useClipLibrary (Home screen state), useTransferSpeed, useTheme
  constants/      Colors, fonts, spacing
modules/
  ts-merge/       Swift: MPEG-TS clips to a single MP4
  ble-scan/       Swift: Bluetooth LE scan and connect, audio route
tests/            Unit tests for the protocol parsers and clip grouping
docs/             Camera protocol and remuxer notes
```

## Getting started

Requirements: a Mac with Xcode, Node 24 or newer, and an iPhone. The app contains native modules,
so it does not run in Expo Go.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Set your Apple team ID and a bundle identifier of your own in `.env.local`, then install a
**Release** build on the phone:

```bash
npx expo run:ios --device --configuration Release
```

A Release build is required because the phone cannot reach the development server while it is
joined to the camera's Wi-Fi.

Then:

1. Open the app once on your normal Wi-Fi.
2. Switch on the camera's Wi-Fi and join that network in iPhone Settings.
3. Tap **Retry** on the Home tab.

## Development

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

## Limitations

- iOS only. The camera's Wi-Fi network is joined manually in iPhone Settings.
- The app has to stay in the foreground during downloads and joins.
- Download speed is bounded by the camera's Wi-Fi (about 3.5 MB per second on the FreeConn R3).
- All clips of a day must share the same video settings to be joined.
- No live preview or in-app playback.

## License

[MIT](LICENSE)
