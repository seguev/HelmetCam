import ExpoModulesCore

public class TsMergeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TsMerge")

    Events("onProgress")

    AsyncFunction("merge") { (inputs: [URL], output: URL) -> [String: Any] in
      try TSRemuxer.merge(inputs: inputs, output: output) { progress in
        self.sendEvent("onProgress", ["progress": progress])
      }
      let size = (try? FileManager.default.attributesOfItem(atPath: output.path)[.size] as? NSNumber)?.int64Value ?? 0
      return ["uri": output.absoluteString, "sizeBytes": size]
    }
  }
}
