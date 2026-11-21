import AVFoundation
import ExpoModulesCore

public class BleScanModule: Module {
  private let central = BleCentral()

  public func definition() -> ModuleDefinition {
    Name("BleScan")

    Events("onState", "onDevice", "onDisconnect")

    OnCreate {
      self.central.onState = { [weak self] state in self?.sendEvent("onState", ["state": state]) }
      self.central.onDevice = { [weak self] device in self?.sendEvent("onDevice", device) }
      self.central.onDisconnect = { [weak self] id in self?.sendEvent("onDisconnect", ["id": id]) }
    }

    AsyncFunction("startScan") {
      self.central.startScan()
    }

    AsyncFunction("stopScan") {
      self.central.stopScan()
    }

    AsyncFunction("connect") { (id: String, promise: Promise) in
      self.central.connect(id) { result in
        switch result {
        case .success(let device): promise.resolve(device)
        case .failure(let error): promise.reject("ERR_BLE_CONNECT", error.localizedDescription)
        }
      }
    }

    AsyncFunction("disconnect") { (id: String) in
      self.central.disconnect(id)
    }

    AsyncFunction("audioDevices") { () -> [[String: String]] in
      let bluetooth: Set<AVAudioSession.Port> = [.bluetoothA2DP, .bluetoothHFP, .bluetoothLE]
      let route = AVAudioSession.sharedInstance().currentRoute
      var seen = Set<String>()
      return (route.outputs + route.inputs)
        .filter { bluetooth.contains($0.portType) && seen.insert($0.uid).inserted }
        .map { ["name": $0.portName, "type": $0.portType.rawValue] }
    }
  }
}
