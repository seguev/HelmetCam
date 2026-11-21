Pod::Spec.new do |s|
  s.name           = 'BleScan'
  s.version        = '1.0.0'
  s.summary        = 'Finds nearby Bluetooth LE devices and lists their services'
  s.description    = 'A small CoreBluetooth wrapper: scan, connect, list services and characteristics, plus the current Bluetooth audio route.'
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
