use std::env;
use std::fs;
use std::process;
use std::io::{self, Read, Write};

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
    let serving = args.get(1).map(String::as_str) == Some("--serve");
    if args.len() != 4 { fail("usage: shaper <font-path> <text> <font-id> OR --serve <font-path> <font-id>"); }
    let font_path = &args[if serving { 2 } else { 1 }];
    let font_id = &args[3];
    let font_data = fs::read(font_path).unwrap_or_else(|_| fail("failed to read font"));
    let face = rustybuzz::Face::from_slice(&font_data, 0).unwrap_or_else(|| fail("failed to parse font"));
    if !serving { shape(&face, font_path, &args[2], font_id); return; }
    let mut input = io::stdin().lock();
    loop {
        let mut header = [0u8; 4];
        match input.read(&mut header[..1]) {
            Ok(0) => return,
            Ok(_) => {},
            Err(_) => fail("failed to read request"),
        }
        input.read_exact(&mut header[1..]).unwrap_or_else(|_| fail("incomplete request"));
        let length = u32::from_be_bytes(header) as usize;
        if length == 0 || length > 16 * 1024 * 1024 { fail("invalid request length"); }
        let mut data = vec![0; length];
        input.read_exact(&mut data).unwrap_or_else(|_| fail("incomplete request"));
        let text = std::str::from_utf8(&data).unwrap_or_else(|_| fail("invalid UTF-8"));
        shape(&face, font_path, text, font_id);
        io::stdout().flush().unwrap_or_else(|_| fail("failed to write response"));
    }
}

fn shape(face: &rustybuzz::Face, font_path: &str, text: &str, font_id: &str) {
    if text.is_empty() { fail("text must not be empty"); }
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
            let ink = face.glyph_bounding_box(rustybuzz::ttf_parser::GlyphId(info.glyph_id as u16))
                .map(|b| format!("{{\"xMin\":{},\"xMax\":{},\"yMin\":{},\"yMax\":{}}}", b.x_min, b.x_max, b.y_min, b.y_max))
                .unwrap_or_else(|| "null".to_string());
            format!(
                "{{\"index\":{index},\"glyphId\":{},\"cluster\":{},\"xAdvance\":{},\"yAdvance\":{},\"xOffset\":{},\"yOffset\":{},\"ink\":{ink}}}",
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
        "{{\"source\":\"{}\",\"shaperRevision\":\"{}\",\"fontId\":\"{}\",\"fontPath\":\"{}\",\"text\":\"{}\",\"textByteLength\":{},\"textScalarCount\":{},\"unitsPerEm\":{},\"ascent\":{},\"descent\":{},\"glyphCount\":{},\"glyphs\":[{}]}}",
        SOURCE,
        SHAPER_REVISION,
        escape_json(font_id),
        escape_json(font_path),
        escape_json(text),
        text.len(),
        text.chars().count(),
        face.units_per_em(),
        face.ascender(),
        face.descender(),
        infos.len(),
        glyphs,
    );
}
