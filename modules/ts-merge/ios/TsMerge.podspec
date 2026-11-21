Pod::Spec.new do |s|
  s.name           = 'TsMerge'
  s.version        = '1.0.0'
  s.summary        = 'Joins MPEG-TS clips into one MP4 without re-encoding'
  s.description    = 'Lifts H.264 and AAC frames out of MPEG-TS clips and writes them into a single MP4 with AVAssetWriter.'
  s.author         = ''
  s.homepage       = 'https://github.com/seguev/HelmetCam'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
