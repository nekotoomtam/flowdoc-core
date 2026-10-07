use icu_segmenter::LineSegmenter;
use std::env;
use std::process;

const SOURCE: &str = "flowdoc-icu4x-native-line-segmenter";
const SEGMENTER_REVISION: &str = "icu_segmenter-2.2.0";
const DATA_REVISION: &str = "icu_segmenter_data-2.2.0";

fn fail(message: &str) -> ! {
    eprintln!("{message}");
    process::exit(1);
}

fn escape_json(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());

    for ch in value.chars() {
        match ch {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            ch if ch.is_control() => escaped.push_str(&format!("\\u{:04x}", ch as u32)),
            ch => escaped.push(ch),
        }
    }

    escaped
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() != 2 {
        fail("usage: flowdoc-icu4x-line-segmenter <text>");
    }

    let text = &args[1];
    if text.is_empty() {
        fail("text must not be empty");
    }

    let segmenter = LineSegmenter::new_auto(Default::default());
    let break_byte_offsets = segmenter
        .segment_str(text)
        .map(|offset| offset.to_string())
        .collect::<Vec<_>>()
        .join(",");

    println!(
        "{{\"source\":\"{}\",\"segmenterRevision\":\"{}\",\"dataRevision\":\"{}\",\"text\":\"{}\",\"textByteLength\":{},\"textScalarCount\":{},\"breakByteOffsets\":[{}]}}",
        SOURCE,
        SEGMENTER_REVISION,
        DATA_REVISION,
        escape_json(text),
        text.len(),
        text.chars().count(),
        break_byte_offsets,
    );
}
