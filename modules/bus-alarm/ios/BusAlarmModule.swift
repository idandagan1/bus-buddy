import ExpoModulesCore
import Foundation
#if canImport(AlarmKit)
import ActivityKit
import AlarmKit
import SwiftUI

@available(iOS 26.0, *)
struct BusAlarmMetadata: AlarmMetadata {}
#endif

public class BusAlarmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BusAlarm")

    Function("isAvailable") { () -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { return true }
      #endif
      return false
    }

    AsyncFunction("requestAuthorization") { () async throws -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        let manager = AlarmManager.shared
        let state = manager.authorizationState == .notDetermined
          ? try await manager.requestAuthorization()
          : manager.authorizationState
        return Self.describe(state)
      }
      #endif
      return "unavailable"
    }

    // Schedules a one-off system alarm. It rings through silent mode and Focus, full screen when locked.
    AsyncFunction("schedule") { (id: String, timestampMs: Double, title: String, sound: String?) async throws -> String in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        guard let uuid = UUID(uuidString: id) else { throw InvalidAlarmIdException(id) }
        let manager = AlarmManager.shared
        try? manager.cancel(id: uuid)
        let titleResource = LocalizedStringResource(stringLiteral: title)
        let alert: AlarmPresentation.Alert
        if #available(iOS 26.1, *) {
          alert = AlarmPresentation.Alert(title: titleResource)
        } else {
          alert = AlarmPresentation.Alert(
            title: titleResource,
            stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle")
          )
        }
        let attributes = AlarmAttributes<BusAlarmMetadata>(
          presentation: AlarmPresentation(alert: alert),
          tintColor: Color(red: 0.15, green: 0.39, blue: 0.92)
        )
        let date = max(Date(timeIntervalSince1970: timestampMs / 1000), Date().addingTimeInterval(1))
        // nil = the system alarm sound; otherwise a sound file bundled with the app (e.g. "rise.wav").
        let alertSound: AlertConfiguration.AlertSound = sound.map { .named($0) } ?? .default
        _ = try await manager.schedule(id: uuid, configuration: .alarm(schedule: .fixed(date), attributes: attributes, sound: alertSound))
        return uuid.uuidString
      }
      #endif
      throw AlarmKitUnavailableException()
    }

    // Cancels a scheduled alarm, or stops it if it is already ringing. Unknown ids are ignored.
    Function("cancel") { (id: String) in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *), let uuid = UUID(uuidString: id) {
        let manager = AlarmManager.shared
        try? manager.stop(id: uuid)
        try? manager.cancel(id: uuid)
      }
      #endif
    }
  }

  #if canImport(AlarmKit)
  @available(iOS 26.0, *)
  private static func describe(_ state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "denied"
    }
  }
  #endif
}

final class InvalidAlarmIdException: GenericException<String>, @unchecked Sendable {
  override var reason: String { "Invalid alarm id: \(param)" }
}

final class AlarmKitUnavailableException: Exception, @unchecked Sendable {
  override var reason: String { "AlarmKit requires iOS 26 or later" }
}
