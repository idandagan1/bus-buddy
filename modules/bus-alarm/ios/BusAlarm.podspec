Pod::Spec.new do |s|
  s.name           = 'BusAlarm'
  s.version        = '1.0.0'
  s.summary        = 'AlarmKit bridge for the Bus Buddy wake-up alarm'
  s.description    = 'Schedules and cancels iOS 26 AlarmKit alarms from JavaScript.'
  s.license        = 'MIT'
  s.author         = 'Bus Buddy'
  s.homepage       = 'https://bus-buddy.expo.app'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # AlarmKit only exists on iOS 26+; weak-link so the app still launches on older iOS.
  s.weak_frameworks = 'AlarmKit'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
