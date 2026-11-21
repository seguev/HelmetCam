import CoreBluetooth
import Foundation

final class BleCentral: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
  struct BleError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
  }

  typealias Completion = (Result<[String: Any], Error>) -> Void

  var onState: ((String) -> Void)?
  var onDevice: (([String: Any]) -> Void)?
  var onDisconnect: ((String) -> Void)?

  private let queue = DispatchQueue(label: "ble-scan")
  private var manager: CBCentralManager?
  private var peripherals: [UUID: CBPeripheral] = [:]
  private var wantsScan = false
  private var connecting: [UUID: Completion] = [:]
  private var servicesLeft: [UUID: Int] = [:]

  private static let commonServices = ["1800", "1801", "180A", "180F"].map { CBUUID(string: $0) }

  func startScan() {
    queue.async {
      self.wantsScan = true
      if self.manager == nil {
        self.manager = CBCentralManager(delegate: self, queue: self.queue)
      } else {
        self.scanIfPossible()
      }
    }
  }

  func stopScan() {
    queue.async {
      self.wantsScan = false
      if self.manager?.state == .poweredOn { self.manager?.stopScan() }
    }
  }

  func connect(_ id: String, completion: @escaping Completion) {
    queue.async {
      guard let manager = self.manager, manager.state == .poweredOn else {
        return completion(.failure(BleError(message: "Bluetooth is not ready. Scan first.")))
      }
      guard let uuid = UUID(uuidString: id), let peripheral = self.peripherals[uuid] else {
        return completion(.failure(BleError(message: "Unknown device. Scan again.")))
      }
      self.connecting[uuid] = completion
      peripheral.delegate = self
      manager.connect(peripheral)
      self.queue.asyncAfter(deadline: .now() + 15) {
        guard self.connecting[uuid] != nil else { return }
        manager.cancelPeripheralConnection(peripheral)
        self.finish(uuid, .failure(BleError(message: "The device did not answer within 15 seconds.")))
      }
    }
  }

  func disconnect(_ id: String) {
    queue.async {
      guard let uuid = UUID(uuidString: id), let peripheral = self.peripherals[uuid] else { return }
      self.manager?.cancelPeripheralConnection(peripheral)
    }
  }

  private func scanIfPossible() {
    guard wantsScan, let manager, manager.state == .poweredOn else { return }
    for peripheral in manager.retrieveConnectedPeripherals(withServices: Self.commonServices) {
      peripherals[peripheral.identifier] = peripheral
      onDevice?([
        "id": peripheral.identifier.uuidString,
        "name": peripheral.name ?? "",
        "rssi": NSNull(),
        "connectable": true,
        "services": [String](),
        "manufacturerData": "",
        "alreadyConnectedToPhone": true,
      ])
    }
    manager.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
  }

  private func finish(_ uuid: UUID, _ result: Result<[String: Any], Error>) {
    guard let completion = connecting.removeValue(forKey: uuid) else { return }
    servicesLeft[uuid] = nil
    completion(result)
  }

  private static func describe(_ peripheral: CBPeripheral) -> [String: Any] {
    let services = (peripheral.services ?? []).map { service -> [String: Any] in
      let characteristics = (service.characteristics ?? []).map { characteristic -> [String: Any] in
        var properties: [String] = []
        let p = characteristic.properties
        if p.contains(.read) { properties.append("read") }
        if p.contains(.write) { properties.append("write") }
        if p.contains(.writeWithoutResponse) { properties.append("writeWithoutResponse") }
        if p.contains(.notify) { properties.append("notify") }
        if p.contains(.indicate) { properties.append("indicate") }
        return ["uuid": characteristic.uuid.uuidString, "properties": properties]
      }
      return ["uuid": service.uuid.uuidString, "characteristics": characteristics]
    }
    return ["id": peripheral.identifier.uuidString, "name": peripheral.name ?? "", "services": services]
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    let name: String
    switch central.state {
    case .poweredOn: name = "poweredOn"
    case .poweredOff: name = "poweredOff"
    case .unauthorized: name = "unauthorized"
    case .unsupported: name = "unsupported"
    case .resetting: name = "resetting"
    default: name = "unknown"
    }
    onState?(name)
    scanIfPossible()
  }

  func centralManager(
    _ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any], rssi RSSI: NSNumber
  ) {
    peripherals[peripheral.identifier] = peripheral
    let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
    let services = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []).map(\.uuidString)
    let manufacturer = (advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data) ?? Data()
    onDevice?([
      "id": peripheral.identifier.uuidString,
      "name": advertisedName ?? peripheral.name ?? "",
      "rssi": RSSI.intValue,
      "connectable": (advertisementData[CBAdvertisementDataIsConnectable] as? NSNumber)?.boolValue ?? false,
      "services": services,
      "manufacturerData": manufacturer.map { String(format: "%02x", $0) }.joined(),
      "alreadyConnectedToPhone": false,
    ])
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    peripheral.discoverServices(nil)
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    finish(peripheral.identifier, .failure(error ?? BleError(message: "Could not connect.")))
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    finish(peripheral.identifier, .failure(error ?? BleError(message: "The device disconnected.")))
    onDisconnect?(peripheral.identifier.uuidString)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let error { return finish(peripheral.identifier, .failure(error)) }
    let services = peripheral.services ?? []
    guard !services.isEmpty else { return finish(peripheral.identifier, .success(Self.describe(peripheral))) }
    servicesLeft[peripheral.identifier] = services.count
    for service in services { peripheral.discoverCharacteristics(nil, for: service) }
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    let left = (servicesLeft[peripheral.identifier] ?? 1) - 1
    servicesLeft[peripheral.identifier] = left
    if left <= 0 { finish(peripheral.identifier, .success(Self.describe(peripheral))) }
  }
}
