# Joining clips

The camera splits a recording into short MPEG-TS files. `modules/ts-merge` turns a day of them
into a single MP4 by **remuxing**: the encoded video and audio are copied into a new container
and never decoded.

## Input

Each clip is an MPEG-TS file carrying:

- H.264 video, 1920x1080 at 30 fps
- AAC audio in ADTS framing, 32 kHz mono

## Pipeline

1. **Transport stream.** The file is read as 188-byte packets. The program association table
   points to the program map table, which gives the packet IDs of the video and audio streams.
2. **Elementary streams.** Packets of each stream are reassembled into PES packets, each carrying
   a presentation timestamp on a 90 kHz clock.
3. **Video.** H.264 arrives in Annex B form, with start codes between NAL units. MP4 needs
   length-prefixed NAL units, so each one is rewritten with a four byte length. The SPS and PPS
   units become the track's format description; delimiter and filler units are dropped.
4. **Audio.** The ADTS header of every AAC frame is removed. The track's format description is
   built from the sample rate and channel layout in that header.
5. **Timeline.** Every clip restarts its timestamps. Each clip is shifted to begin where the
   previous one ended, so the result plays as one continuous recording.
6. **Writing.** `AVAssetWriter` receives the samples in passthrough mode, with no output settings,
   so nothing is re-encoded.

## Details that matter

- **Clips must start on a keyframe.** Samples before the first keyframe of a clip are skipped;
  otherwise the decoder would show corruption at every join.
- **Interleaving.** Video and audio samples are queued and handed to the writer in timestamp
  order. Feeding one track far ahead of the other makes `AVAssetWriter` stop accepting data.
- **Matching settings.** If a clip's SPS differs from the first clip's, the join stops with an
  error, since mixed settings cannot share one track without re-encoding.
- **Memory.** Files are read in chunks of about 1 MB, so memory use does not grow with the length
  of the day.

## Performance

Because no frames are decoded, the join is limited by storage speed. In testing, 300 clips
totalling 850 MB were joined in under two seconds on a Mac.

## Implementation

- [`TSRemuxer.swift`](../modules/ts-merge/ios/TSRemuxer.swift): parsing and writing
- [`TsMergeModule.swift`](../modules/ts-merge/ios/TsMergeModule.swift): the Expo module exposing `merge(inputs, output)` and progress events
- [`src/camera/merge.ts`](../src/camera/merge.ts): the JavaScript side
