use icu_segmenter::LineSegmenter;
use std::env;
use std::process;
use std::io::{self, Read, Write};
use serde::Deserialize;

const SOURCE: &str = "flowdoc-icu4x-native-line-segmenter";
const SEGMENTER_REVISION: &str = "icu_segmenter-2.2.0";
const DATA_REVISION: &str = "icu_segmenter_data-2.2.0";
const MAX_FRAME: usize = 16 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request { id: u64, text: String }

// Reject before growing beyond the wire budget, including the final newline.
struct Bounded(Vec<u8>);
impl Write for Bounded {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.0.len() + bytes.len() > MAX_FRAME - 1 { return Err(io::Error::other("response too large")); }
        self.0.extend_from_slice(bytes); Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> { Ok(()) }
}

fn serve() {
    let segmenter = LineSegmenter::new_auto(Default::default());
    let mut output = io::stdout().lock();
    writeln!(output,"{{\"protocol\":\"flowdoc-segmenter-session/1\",\"source\":\"{SOURCE}\",\"segmenterRevision\":\"{SEGMENTER_REVISION}\",\"dataRevision\":\"{DATA_REVISION}\"}}")
        .and_then(|_|output.flush()).unwrap_or_else(|_|fail("output failed"));
    let mut input = io::stdin().lock(); let mut last_id = 0;
    loop {
        let mut header = [0;4];
        match input.read(&mut header[..1]) { Ok(0)=>return, Ok(_)=>{}, Err(_)=>fail("input failed") }
        input.read_exact(&mut header[1..]).unwrap_or_else(|_|fail("incomplete request"));
        let length = u32::from_be_bytes(header) as usize;
        if length == 0 || length > MAX_FRAME { fail("invalid request length"); }
        let mut bytes = vec![0;length];
        input.read_exact(&mut bytes).unwrap_or_else(|_|fail("incomplete request"));
        let request: Request = serde_json::from_slice(&bytes).unwrap_or_else(|_|fail("invalid request"));
        if request.id <= last_id || request.id > 9_007_199_254_740_991 || request.text.is_empty() { fail("invalid request"); }
        last_id = request.id;
        drop(bytes);
        let mut line = Bounded(Vec::new());
        // Stream offsets through SerializeSeq rather than collecting a second large array.
        struct Offsets<'a>(&'a str, &'a icu_segmenter::LineSegmenterBorrowed<'static>);
        impl serde::Serialize for Offsets<'_> {
            fn serialize<S:serde::Serializer>(&self,s:S)->Result<S::Ok,S::Error>{
                use serde::ser::SerializeSeq;
                let mut seq=s.serialize_seq(None)?;
                for offset in self.1.segment_str(self.0) { seq.serialize_element(&offset)?; }
                seq.end()
            }
        }
        #[derive(serde::Serialize)]
        #[serde(rename_all="camelCase")]
        struct Response<'a> {
            id:u64, source:&'static str, segmenter_revision:&'static str, data_revision:&'static str,
            text:&'a str, text_byte_length:usize, text_scalar_count:usize, break_byte_offsets:Offsets<'a>,
        }
        let response=Response {id:request.id,source:SOURCE,segmenter_revision:SEGMENTER_REVISION,data_revision:DATA_REVISION,
            text:&request.text,text_byte_length:request.text.len(),text_scalar_count:request.text.chars().count(),break_byte_offsets:Offsets(&request.text,&segmenter)};
        serde_json::to_writer(&mut line,&response).unwrap_or_else(|_|fail("response too large"));
        output.write_all(&line.0).and_then(|_|output.write_all(b"\n")).and_then(|_|output.flush()).unwrap_or_else(|_|fail("output failed"));
    }
}

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
    if args.len() == 2 && args[1] == "--serve" { serve(); return; }
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
