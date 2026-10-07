use wasm_bindgen::prelude::wasm_bindgen;

pub const FLOWDOC_TEXT_ENGINE_WASM_BOUNDARY_VERSION: &str =
    "flowdoc-text-engine-wasm-boundary-v1";

#[wasm_bindgen]
pub fn flowdoc_text_engine_wasm_readiness_marker() -> u32 {
    1
}

#[wasm_bindgen]
pub fn flowdoc_text_engine_wasm_boundary_version() -> String {
    FLOWDOC_TEXT_ENGINE_WASM_BOUNDARY_VERSION.to_string()
}
