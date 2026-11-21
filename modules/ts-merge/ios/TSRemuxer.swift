import AVFoundation
import CoreMedia
import Foundation

public final class TSRemuxer {
  public enum RemuxError: Error, LocalizedError {
    case noVideo
    case settingsChanged(String)
    case writer(String)
    case cannotRead(String)

    public var errorDescription: String? {
      switch self {
      case .noVideo: return "No H.264 video was found in the clips."
      case .settingsChanged(let name):
        return "\(name) was recorded with different video settings, so it cannot be joined without re-encoding."
      case .writer(let message): return "Could not write the MP4: \(message)"
      case .cannotRead(let name): return "Could not read \(name)."
      }
    }
  }

  private static let packetSize = 188
  private static let timescale: CMTimeScale = 90_000
  private static let h264StreamType: UInt8 = 0x1B
  private static let aacStreamType: UInt8 = 0x0F
  private static let sampleRates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350]

  private let writer: AVAssetWriter
  private var videoInput: AVAssetWriterInput?
  private var audioInput: AVAssetWriterInput?
  private var videoFormat: CMFormatDescription?
  private var audioFormat: CMFormatDescription?
  private var started = false
  private var pending: [(sample: CMSampleBuffer, isVideo: Bool)] = []
  private var videoQueue: [CMSampleBuffer] = []
  private var audioQueue: [CMSampleBuffer] = []
  private var videoFinished = false
  private var audioFinished = false

  private var sps: Data?
  private var pps: Data?
  private var audioSampleRate = 0

  private var currentName = ""
  private var pmtPid = -1
  private var videoPid = -1
  private var audioPid = -1
  private var videoPES = Data()
  private var audioPES = Data()
  private var fileBase: Int64?

  private var fileOffset: Int64 = 0
  private var outEnd: Int64 = 0
  private var lastVideoDts: Int64 = -1
  private var lastAudioPts: Int64 = -1
  private var frameDuration: Int64 = 3000

  private init(output: URL) throws {
    try? FileManager.default.removeItem(at: output)
    writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = false
  }

  public static func merge(inputs: [URL], output: URL, progress: (Double) -> Void) throws {
    let remuxer = try TSRemuxer(output: output)
    let sizes = inputs.map { url -> Int64 in
      let size = try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber
      return size?.int64Value ?? 0
    }
    let total = max(1, sizes.reduce(0, +))
    var done: Int64 = 0
    var lastReported = -1

    for (index, url) in inputs.enumerated() {
      try remuxer.process(file: url) { bytesInFile in
        let percent = Int(Double(done + bytesInFile) / Double(total) * 100)
        if percent != lastReported {
          lastReported = percent
          progress(Double(percent) / 100)
        }
      }
      done += sizes[index]
    }
    try remuxer.finish()
    progress(1)
  }

  private func process(file url: URL, onBytes: (Int64) -> Void) throws {
    guard let handle = try? FileHandle(forReadingFrom: url) else {
      throw RemuxError.cannotRead(url.lastPathComponent)
    }
    defer { try? handle.close() }

    currentName = url.lastPathComponent
    pmtPid = -1
    videoPid = -1
    audioPid = -1
    videoPES.removeAll(keepingCapacity: true)
    audioPES.removeAll(keepingCapacity: true)
    fileBase = nil
    fileOffset = outEnd

    let chunkSize = Self.packetSize * 5_000
    var read: Int64 = 0
    while true {
      let finished: Bool = try autoreleasepool {
        guard let chunk = try handle.read(upToCount: chunkSize), !chunk.isEmpty else { return true }
        try chunk.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
          let bytes = raw.bindMemory(to: UInt8.self)
          var offset = 0
          while offset + Self.packetSize <= bytes.count {
            try handlePacket(UnsafeBufferPointer(rebasing: bytes[offset..<offset + Self.packetSize]))
            offset += Self.packetSize
          }
        }
        read += Int64(chunk.count)
        onBytes(read)
        return false
      }
      if finished { break }
    }
    try flushVideo()
    try flushAudio()
  }

  private func handlePacket(_ p: UnsafeBufferPointer<UInt8>) throws {
    guard p[0] == 0x47 else { return }
    let startsUnit = p[1] & 0x40 != 0
    let pid = (Int(p[1] & 0x1F) << 8) | Int(p[2])
    let adaptation = (p[3] >> 4) & 0x3
    var offset = 4
    if adaptation & 0x2 != 0 { offset += 1 + Int(p[4]) }
    guard adaptation & 0x1 != 0, offset < Self.packetSize else { return }
    let payload = UnsafeBufferPointer(rebasing: p[offset...])

    if pid == 0 {
      if startsUnit { parsePAT(payload) }
    } else if pid == pmtPid {
      if startsUnit { parsePMT(payload) }
    } else if pid == videoPid {
      if startsUnit { try flushVideo() }
      videoPES.append(payload)
    } else if pid == audioPid {
      if startsUnit { try flushAudio() }
      audioPES.append(payload)
    }
  }

  private func parsePAT(_ p: UnsafeBufferPointer<UInt8>) {
    let s = 1 + Int(p[0])
    guard s + 12 <= p.count else { return }
    let sectionLength = (Int(p[s + 1] & 0x0F) << 8) | Int(p[s + 2])
    var i = s + 8
    let end = min(p.count, s + 3 + sectionLength - 4)
    while i + 4 <= end {
      let program = (Int(p[i]) << 8) | Int(p[i + 1])
      if program != 0 {
        pmtPid = (Int(p[i + 2] & 0x1F) << 8) | Int(p[i + 3])
        return
      }
      i += 4
    }
  }

  private func parsePMT(_ p: UnsafeBufferPointer<UInt8>) {
    let s = 1 + Int(p[0])
    guard s + 12 <= p.count else { return }
    let sectionLength = (Int(p[s + 1] & 0x0F) << 8) | Int(p[s + 2])
    let programInfoLength = (Int(p[s + 10] & 0x0F) << 8) | Int(p[s + 11])
    var i = s + 12 + programInfoLength
    let end = min(p.count, s + 3 + sectionLength - 4)
    while i + 5 <= end {
      let streamType = p[i]
      let pid = (Int(p[i + 1] & 0x1F) << 8) | Int(p[i + 2])
      let infoLength = (Int(p[i + 3] & 0x0F) << 8) | Int(p[i + 4])
      if streamType == Self.h264StreamType, videoPid < 0 { videoPid = pid }
      if streamType == Self.aacStreamType, audioPid < 0 { audioPid = pid }
      i += 5 + infoLength
    }
  }

  private struct PESHeader {
    var pts: Int64
    var dts: Int64
    var payloadStart: Int
  }

  private func parsePESHeader(_ data: Data) -> PESHeader? {
    guard data.count >= 14, data[0] == 0, data[1] == 0, data[2] == 1 else { return nil }
    let flags = data[7]
    let headerLength = Int(data[8])
    guard flags & 0x80 != 0, data.count >= 9 + headerLength else { return nil }
    func timestamp(at i: Int) -> Int64 {
      (Int64(data[i] >> 1) & 0x7) << 30 | Int64(data[i + 1]) << 22 | Int64(data[i + 2] >> 1) << 15
        | Int64(data[i + 3]) << 7 | Int64(data[i + 4] >> 1)
    }
    let pts = timestamp(at: 9)
    let dts = (flags & 0x40 != 0 && headerLength >= 10) ? timestamp(at: 14) : pts
    return PESHeader(pts: pts, dts: dts, payloadStart: 9 + headerLength)
  }

  private func flushVideo() throws {
    defer { videoPES.removeAll(keepingCapacity: true) }
    guard !videoPES.isEmpty, let header = parsePESHeader(videoPES) else { return }

    var frame = Data(capacity: videoPES.count)
    var isKeyframe = false

    try videoPES.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
      let b = raw.bindMemory(to: UInt8.self)
      let count = b.count
      var nalStart = -1
      var i = header.payloadStart

      func emit(_ start: Int, _ rawEnd: Int) throws {
        var end = rawEnd
        while end > start, b[end - 1] == 0 { end -= 1 }
        guard end > start else { return }
        let nal = UnsafeBufferPointer(rebasing: b[start..<end])
        switch nal[0] & 0x1F {
        case 7:
          let data = Data(nal)
          if let known = sps, known != data, videoFormat != nil {
            throw RemuxError.settingsChanged(currentName)
          }
          sps = data
        case 8:
          if pps == nil || videoFormat == nil { pps = Data(nal) }
        case 9, 12:
          break
        default:
          if nal[0] & 0x1F == 5 { isKeyframe = true }
          var length = UInt32(nal.count).bigEndian
          withUnsafeBytes(of: &length) { frame.append(contentsOf: $0) }
          frame.append(nal)
        }
      }

      while i + 3 <= count {
        if b[i] == 0, b[i + 1] == 0, b[i + 2] == 1 {
          if nalStart >= 0 { try emit(nalStart, i) }
          nalStart = i + 3
          i += 3
        } else {
          i += 1
        }
      }
      if nalStart >= 0 { try emit(nalStart, count) }
    }

    if videoFormat == nil, let sps, let pps {
      videoFormat = try Self.makeVideoFormat(sps: sps, pps: pps)
    }
    guard let videoFormat, !frame.isEmpty else { return }

    if fileBase == nil {
      guard isKeyframe else { return }
      fileBase = header.dts
    }
    guard let fileBase else { return }

    let dts = header.dts - fileBase + fileOffset
    let pts = header.pts - fileBase + fileOffset
    guard dts > lastVideoDts, pts >= 0 else { return }
    if lastVideoDts >= 0, dts - lastVideoDts < 90_000 { frameDuration = dts - lastVideoDts }
    lastVideoDts = dts
    outEnd = max(outEnd, dts + frameDuration)

    let sample = try Self.makeSample(
      frame, format: videoFormat,
      pts: CMTime(value: pts, timescale: Self.timescale),
      dts: CMTime(value: dts, timescale: Self.timescale),
      duration: .invalid, isSync: isKeyframe)
    try append(sample, isVideo: true)
  }

  private func flushAudio() throws {
    defer { audioPES.removeAll(keepingCapacity: true) }
    guard !audioPES.isEmpty, let header = parsePESHeader(audioPES) else { return }
    guard let fileBase else { return }

    let b = audioPES
    var i = header.payloadStart
    var frameIndex: Int64 = 0
    while i + 7 <= b.count {
      guard b[i] == 0xFF, b[i + 1] & 0xF0 == 0xF0 else { break }
      let hasCRC = b[i + 1] & 0x01 == 0
      let objectType = Int(b[i + 2] >> 6) + 1
      let rateIndex = Int(b[i + 2] >> 2) & 0x0F
      let channels = (Int(b[i + 2] & 0x01) << 2) | Int(b[i + 3] >> 6)
      let frameLength = (Int(b[i + 3] & 0x03) << 11) | (Int(b[i + 4]) << 3) | Int(b[i + 5] >> 5)
      let headerLength = hasCRC ? 9 : 7
      guard frameLength > headerLength, i + frameLength <= b.count, rateIndex < Self.sampleRates.count else { break }

      if audioFormat == nil {
        audioSampleRate = Self.sampleRates[rateIndex]
        audioFormat = try Self.makeAudioFormat(
          objectType: objectType, rateIndex: rateIndex, sampleRate: audioSampleRate, channels: channels)
      }
      if let audioFormat, audioSampleRate > 0 {
        let ticksPerFrame = Int64(1024) * Int64(Self.timescale)
        let pts = header.pts + frameIndex * ticksPerFrame / Int64(audioSampleRate) - fileBase + fileOffset
        if pts >= 0, pts > lastAudioPts {
          lastAudioPts = pts
          outEnd = max(outEnd, pts + ticksPerFrame / Int64(audioSampleRate))
          let sample = try Self.makeAudioSample(
            b.subdata(in: (i + headerLength)..<(i + frameLength)), format: audioFormat,
            pts: CMTime(value: pts, timescale: Self.timescale))
          try append(sample, isVideo: false)
        }
      }
      frameIndex += 1
      i += frameLength
    }
  }

  private func append(_ sample: CMSampleBuffer, isVideo: Bool) throws {
    if !started {
      pending.append((sample, isVideo))
      let videoCount = pending.lazy.filter { $0.isVideo }.count
      if videoFormat != nil, audioFormat != nil || videoCount > 300 {
        try start()
      }
      return
    }
    enqueue(sample, isVideo: isVideo)
    try pump(draining: false)
  }

  private func enqueue(_ sample: CMSampleBuffer, isVideo: Bool) {
    if isVideo {
      videoQueue.append(sample)
    } else if audioInput != nil {
      audioQueue.append(sample)
    }
  }

  private func start() throws {
    guard let videoFormat else { throw RemuxError.noVideo }
    let video = AVAssetWriterInput(mediaType: .video, outputSettings: nil, sourceFormatHint: videoFormat)
    video.expectsMediaDataInRealTime = false
    writer.add(video)
    videoInput = video
    if let audioFormat {
      let audio = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: audioFormat)
      audio.expectsMediaDataInRealTime = false
      writer.add(audio)
      audioInput = audio
    }
    guard writer.startWriting() else {
      throw RemuxError.writer(writer.error?.localizedDescription ?? "could not start")
    }
    writer.startSession(atSourceTime: .zero)
    started = true
    let queued = pending
    pending.removeAll()
    for item in queued { enqueue(item.sample, isVideo: item.isVideo) }
    try pump(draining: false)
  }

  private static func time(of sample: CMSampleBuffer) -> CMTime {
    let dts = CMSampleBufferGetDecodeTimeStamp(sample)
    return dts.isValid ? dts : CMSampleBufferGetPresentationTimeStamp(sample)
  }

  private func pump(draining: Bool) throws {
    guard let videoInput else { return }
    var waited = 0.0

    while true {
      let video = videoQueue.first
      let audio = audioInput == nil ? nil : audioQueue.first
      if video == nil, audio == nil { return }

      if audioInput != nil, !draining, video == nil || audio == nil { return }
      if draining, let audioInput {
        if audio == nil, !audioFinished { audioInput.markAsFinished(); audioFinished = true }
        if video == nil, !videoFinished { videoInput.markAsFinished(); videoFinished = true }
      }

      let videoFirst: Bool
      if let video, let audio {
        videoFirst = CMTimeCompare(Self.time(of: video), Self.time(of: audio)) <= 0
      } else {
        videoFirst = video != nil
      }

      var wrote = false
      for useVideo in [videoFirst, !videoFirst] {
        guard let sample = useVideo ? video : audio, let input = useVideo ? videoInput : audioInput,
          input.isReadyForMoreMediaData
        else { continue }
        guard input.append(sample) else {
          throw RemuxError.writer(writer.error?.localizedDescription ?? "a sample was rejected")
        }
        if useVideo { videoQueue.removeFirst() } else { audioQueue.removeFirst() }
        wrote = true
        break
      }

      if wrote {
        waited = 0
      } else {
        guard writer.status == .writing, waited < 15 else {
          throw RemuxError.writer(writer.error?.localizedDescription ?? "the writer stopped accepting data")
        }
        Thread.sleep(forTimeInterval: 0.001)
        waited += 0.001
      }
    }
  }

  private func finish() throws {
    if !started {
      guard videoFormat != nil else { throw RemuxError.noVideo }
      try start()
    }
    try pump(draining: true)
    if !videoFinished { videoInput?.markAsFinished() }
    if !audioFinished { audioInput?.markAsFinished() }
    let semaphore = DispatchSemaphore(value: 0)
    writer.finishWriting { semaphore.signal() }
    semaphore.wait()
    guard writer.status == .completed else {
      throw RemuxError.writer(writer.error?.localizedDescription ?? "could not finish the file")
    }
  }

  private static func makeVideoFormat(sps: Data, pps: Data) throws -> CMFormatDescription {
    var format: CMFormatDescription?
    let status = sps.withUnsafeBytes { (spsRaw: UnsafeRawBufferPointer) in
      pps.withUnsafeBytes { (ppsRaw: UnsafeRawBufferPointer) -> OSStatus in
        let pointers = [
          spsRaw.bindMemory(to: UInt8.self).baseAddress!,
          ppsRaw.bindMemory(to: UInt8.self).baseAddress!,
        ]
        let sizes = [sps.count, pps.count]
        return CMVideoFormatDescriptionCreateFromH264ParameterSets(
          allocator: kCFAllocatorDefault, parameterSetCount: 2, parameterSetPointers: pointers,
          parameterSetSizes: sizes, nalUnitHeaderLength: 4, formatDescriptionOut: &format)
      }
    }
    guard status == noErr, let format else { throw RemuxError.writer("bad H.264 parameters (\(status))") }
    return format
  }

  private static func makeAudioFormat(objectType: Int, rateIndex: Int, sampleRate: Int, channels: Int) throws
    -> CMFormatDescription
  {
    var description = AudioStreamBasicDescription(
      mSampleRate: Float64(sampleRate), mFormatID: kAudioFormatMPEG4AAC, mFormatFlags: UInt32(objectType),
      mBytesPerPacket: 0, mFramesPerPacket: 1024, mBytesPerFrame: 0, mChannelsPerFrame: UInt32(channels),
      mBitsPerChannel: 0, mReserved: 0)
    let asc: [UInt8] = [
      UInt8(objectType << 3 | rateIndex >> 1),
      UInt8((rateIndex & 0x1) << 7 | channels << 3),
    ]
    let config: [UInt8] =
      [0x03, 0x19, 0x00, 0x00, 0x00]
      + [0x04, 0x11, 0x40, 0x15]
      + [UInt8](repeating: 0, count: 11)
      + [0x05, 0x02] + asc
      + [0x06, 0x01, 0x02]
    var format: CMFormatDescription?
    let status = CMAudioFormatDescriptionCreate(
      allocator: kCFAllocatorDefault, asbd: &description, layoutSize: 0, layout: nil,
      magicCookieSize: config.count, magicCookie: config, extensions: nil, formatDescriptionOut: &format)
    guard status == noErr, let format else { throw RemuxError.writer("bad AAC parameters (\(status))") }
    return format
  }

  private static func makeBlock(_ data: Data) throws -> CMBlockBuffer {
    var block: CMBlockBuffer?
    var status = CMBlockBufferCreateWithMemoryBlock(
      allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: data.count,
      blockAllocator: kCFAllocatorDefault, customBlockSource: nil, offsetToData: 0,
      dataLength: data.count, flags: kCMBlockBufferAssureMemoryNowFlag, blockBufferOut: &block)
    guard status == noErr, let block else { throw RemuxError.writer("out of memory (\(status))") }
    status = data.withUnsafeBytes {
      CMBlockBufferReplaceDataBytes(
        with: $0.baseAddress!, blockBuffer: block, offsetIntoDestination: 0, dataLength: data.count)
    }
    guard status == noErr else { throw RemuxError.writer("copy failed (\(status))") }
    return block
  }

  private static func makeAudioSample(_ data: Data, format: CMFormatDescription, pts: CMTime) throws
    -> CMSampleBuffer
  {
    let block = try makeBlock(data)
    var packet = AudioStreamPacketDescription(
      mStartOffset: 0, mVariableFramesInPacket: 0, mDataByteSize: UInt32(data.count))
    var sample: CMSampleBuffer?
    let status = CMAudioSampleBufferCreateReadyWithPacketDescriptions(
      allocator: kCFAllocatorDefault, dataBuffer: block, formatDescription: format, sampleCount: 1,
      presentationTimeStamp: pts, packetDescriptions: &packet, sampleBufferOut: &sample)
    guard status == noErr, let sample else { throw RemuxError.writer("bad audio sample (\(status))") }
    return sample
  }

  private static func makeSample(
    _ data: Data, format: CMFormatDescription, pts: CMTime, dts: CMTime, duration: CMTime, isSync: Bool
  ) throws -> CMSampleBuffer {
    let block = try makeBlock(data)

    var timing = CMSampleTimingInfo(duration: duration, presentationTimeStamp: pts, decodeTimeStamp: dts)
    var size = data.count
    var sample: CMSampleBuffer?
    let status = CMSampleBufferCreateReady(
      allocator: kCFAllocatorDefault, dataBuffer: block, formatDescription: format, sampleCount: 1,
      sampleTimingEntryCount: 1, sampleTimingArray: &timing, sampleSizeEntryCount: 1,
      sampleSizeArray: &size, sampleBufferOut: &sample)
    guard status == noErr, let sample else { throw RemuxError.writer("bad sample (\(status))") }

    if !isSync,
      let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: true),
      CFArrayGetCount(attachments) > 0
    {
      let dict = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
      CFDictionarySetValue(
        dict, Unmanaged.passUnretained(kCMSampleAttachmentKey_NotSync).toOpaque(),
        Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
    }
    return sample
  }
}
