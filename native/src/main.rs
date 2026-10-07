use std::env;
use std::fs;
use std::process;

const SOURCE: &str = "flowdoc-rustybuzz-native-smoke";
const SHAPER_REVISION: &str = "rustybuzz-0.20.1";

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
    if args.len() != 4 {
        fail("usage: flowdoc-rustybuzz-smoke <font-path> <text> <font-id>");
    }

    let font_path = &args[1];
    let text = &args[2];
    let font_id = &args[3];
    if text.is_empty() {
        fail("text must not be empty");
    }

    let font_data = fs::read(font_path).unwrap_or_else(|error| {
        fail(&format!("failed to read font file `{font_path}`: {error}"))
    });
    let face = rustybuzz::Face::from_slice(&font_data, 0)
        .unwrap_or_else(|| fail(&format!("failed to parse font file `{font_path}`")));

    let mut buffer = rustybuzz::UnicodeBuffer::new();
    buffer.push_str(text);

    let glyph_buffer = rustybuzz::shape(&face, &[], buffer);
    let infos = glyph_buffer.glyph_infos();
    let positions = glyph_buffer.glyph_positions();
    if infos.is_empty() {
        fail("rustybuzz returned no glyphs");
    }

    let glyphs = infos
        .iter()
        .zip(positions.iter())
        .enumerate()
        .map(|(index, (info, position))| {
            format!(
                "{{\"index\":{index},\"glyphId\":{},\"cluster\":{},\"xAdvance\":{},\"yAdvance\":{},\"xOffset\":{},\"yOffset\":{}}}",
                info.glyph_id,
                info.cluster,
                position.x_advance,
                position.y_advance,
                position.x_offset,
                position.y_offset,
            )
        })
        .collect::<Vec<_>>()
        .join(",");

    println!(
        "{{\"source\":\"{}\",\"shaperRevision\":\"{}\",\"fontId\":\"{}\",\"fontPath\":\"{}\",\"text\":\"{}\",\"textByteLength\":{},\"textScalarCount\":{},\"unitsPerEm\":{},\"glyphCount\":{},\"glyphs\":[{}]}}",
        SOURCE,
        SHAPER_REVISION,
        escape_json(font_id),
        escape_json(font_path),
        escape_json(text),
        text.len(),
        text.chars().count(),
        face.units_per_em(),
        infos.len(),
        glyphs,
    );
}
