# คู่มือสร้างแม่แบบ FlowDoc Core 0.2.0

## Authority Boundary

Owner: flowdoc-core. คู่มือนี้อธิบายรูปแบบแม่แบบและ binding ที่ package 0.2.0 รองรับ
ไม่ใช่ roadmap หรือการรับรอง release สถานะร่วมและข้อจำกัดที่ตกลงอยู่ใน
flowdoc-project-control `docs/domains/flowdoc-page-system-roadmap-2026-10-10.md`
วิธี import/publish และเรียก HTTP อยู่ใน [คู่มือ Service](../../flowdoc-service/docs/usage.md)
ชนิดข้อมูลฉบับโค้ดอยู่ใน [template/types.ts](../src/template/types.ts)

แม่แบบใหม่ที่ต้องการระบบหน้าครบให้เริ่มจาก model16 ด้านท้ายคู่มือนี้
หัวข้อ model4–14 อธิบายสัญญาเดิมเพื่ออ่านแม่แบบเก่า ไม่ใช่ข้อจำกัดของ model16

## 1. แม่แบบ ข้อมูล และเวอร์ชัน

แม่แบบกำหนดหน้ากระดาษ style ตัวแปร และรูปแบบเนื้อหาที่ใช้ซ้ำได้
ผู้ใช้ API ส่งค่าและลำดับรายการเข้ามา ระบบ bind ค่าแล้ววัดและจัดหน้าเพื่อออก PDF
ไม่ต้องส่งพิกัด ไม่ต้องสร้างกราฟ node ใหม่ทุกครั้ง

| ส่วน | หน้าที่ |
| --- | --- |
| templateId | ตัวตนของแม่แบบ |
| docKey | ชื่อที่ผู้เรียกใช้เลือกแม่แบบ |
| version | เวอร์ชันเนื้อหาที่ publish แล้ว ไม่ใช่เวอร์ชัน package |
| schemaVersion | รูปแบบ envelope ปัจจุบันเป็น 1 |
| nodeModelVersion | ระดับความสามารถของกราฟ เลือกให้ตรงสิ่งที่ใช้ |
| book / styles | หน้ากระดาษและรูปแบบข้อความ |
| globalSchema | ตัวแปรกลางของเล่ม |
| formats | รูปแบบหลักที่ผู้เรียกเรียงผ่าน content |
| areaFormats | โครงย่อยที่แต่ละ area เป็นเจ้าของ ใน model 11 |
| examples | ชุดตัวอย่าง request ที่ต้องผ่าน validation โดยไม่มี warning |

ตัวอย่างเต็มที่เริ่มแก้ได้ทันที:

| ต้องการ | ไฟล์ |
| --- | --- |
| ข้อความผสมตัวแปร | [binding-text](../fixtures/binding-text/template.json) |
| ตารางและแถวตามรายการ | [table](../fixtures/table/template.json) |
| รูปหลายรายการในเซลล์ | [cell-repeats](../fixtures/cell-repeats/template.json) |
| Area และโครงย่อย | [areas](../fixtures/areas/template.json) |
| สารบัญ | [contents](../fixtures/contents/template.json) |

อย่าเพิ่ม nodeModelVersion ให้แม่แบบเก่าอัตโนมัติ เพราะบางรุ่นกำหนดสัญญาต่างกัน
รุ่น package 0.2.0 อ่าน model 4–16 ได้ แต่ใช้ความสามารถใหม่ต้องเลือกรุ่น model ที่รองรับ

| Model | สิ่งที่เพิ่ม |
| --- | --- |
| 4 | TextBlock, ตาราง, binding และแถวซ้ำ |
| 5 | Image |
| 6 | เซลล์รวม |
| 7 | ลิงก์และจุดหมายภายในเอกสาร |
| 8 | สารบัญ |
| 9 | TextBlock/Image หลายชิ้นในเซลล์และ padding รายด้าน |
| 10 | image ใน array item และ cellRepeats |
| 11 | area พร้อมโครงย่อยที่เป็นเจ้าของ |
| 12 | pageLayouts และ sections |
| 13 | ปก กล่องจองความสูง และหน้าเปล่า |
| 14 | หัวท้ายแยกพื้นที่ |
| 15 | ข้อมูลและหัวท้ายแยกตาม Section |
| 16 | current/total และนโยบายเลขหน้าราย Section |

หน้าปัจจุบันใช้ A4 แนวตั้งหรือแนวนอน margin หน่วย mm/pt และ contentSlot เป็น body
ฟอนต์ที่แพ็กไว้คือ Sarabun Regular/Bold/Italic/BoldItalic อ้างผ่าน fontFamilyKey
`sarabun` ตั้ง fontSize และ lineHeightPt ให้พอสำหรับวรรณยุกต์ไทย
ตัวอย่าง 12 pt / lineHeightPt 20–22 เป็นจุดเริ่มตาม fixture ไม่ใช่ค่าที่ใช้ได้กับทุกขนาด
ไม่มีการตัดตัวอักษรหรือใช้ฟอนต์อื่นเงียบ ๆ เมื่อพื้นที่ไม่พอ

## 2. ข้อความกับตัวแปรใช้ร่วมกัน

ตัวแปรเป็นส่วนหนึ่งของ TextBlock ได้ ไม่ต้องสร้าง node ทั้งก้อนให้ตัวแปรคำเดียว
ตัวอย่างส่วน `children` ภายใน TextBlock:

```json
[
  {"id":"leaf-001","type":"text","text":"โครงการ "},
  {"id":"leaf-002","type":"field-ref","scope":"global","key":"projectName"},
  {"id":"leaf-003","type":"text","text":" มีรายละเอียดดังนี้"}
]
```

ประกาศ `projectName` ใน `globalSchema.fields` เช่น
`{"type":"string","required":true,"allowEmpty":false}`
`global` อ่าน data กลาง, `local` อ่าน data ของรูปแบบที่กำลังใช้ และ `item`
อ่านรายการ array ในบริเวณ repeat ที่ประกาศไว้ ไม่มีการเดาข้าม scope
ข้อความขึ้นบรรทัดด้วย newline ได้ ส่วน wrap ปกติใช้การวัดข้อความของ Core

ID ของ node/leaf เป็นตัวตนโครงสร้าง ส่วน key เป็นชื่อข้อมูลที่ผู้เรียกส่งมา
ตัวอย่าง `childIds: ["node-001", "node-002"]` อ้าง node ไม่ใช่ชื่อตัวแปร
ลำดับ rootIds/childIds คือลำดับวางเนื้อหาในตำแหน่งนั้น

## 3. ระบบ type และค่าที่ขาด

| Type | ค่าที่ผู้เรียกส่ง |
| --- | --- |
| string | ข้อความ |
| image | resource UUID จากขั้น upload ของ Service |
| link | object คำสั่ง url/link/reference |
| array | รายการ object ตาม items.fields ชั้นเดียว |
| area | รายการ `{format, data}` ของโครงย่อยที่อนุญาต |

`object` ใช้กับ schema envelope และ array item ไม่ใช่เปิด arbitrary nested object
array item รองรับ string/link และ image ใน model 10 ขึ้นไป ไม่รองรับ array ซ้อน

ลำดับตรวจค่าที่ไม่ส่งมา: required ขาดให้ fail แม้มี default;
ถ้า optional ใช้ default ที่ประกาศ มิฉะนั้นข้อความเป็น `""` และรายการเป็น `[]`
optional image/link ที่ไม่ส่งไม่แสดงเนื้อหานั้น
ส่ง null หรือชนิดผิดไม่แปลงให้เป็น string อัตโนมัติ
key ข้อมูลที่ไม่รู้จักแจ้ง warning ส่วนรูปแบบหลักที่ไม่รู้จักข้ามพร้อม warning
ต้องมีรูปแบบหลักที่รับได้อย่างน้อยหนึ่งรายการ

## 4. ตารางและเนื้อหาในเซลล์

ประกาศความกว้างคอลัมน์ให้รวมแล้วอยู่ในพื้นที่พิมพ์ ใช้ Length `{value, unit}`
หน่วย `pt` หรือ `mm` เซลล์วาง TextBlock/Image เรียงแนวตั้งตาม childIds
ยังไม่มี Columns หรือตารางซ้อนในเซลล์ และภาพยังเป็น node แยก ไม่ใช่ inline ในข้อความ

model 9 ขึ้นไปกำหนด padding แต่ละด้านได้ ด้านที่ไม่ระบุใช้ 4 pt
ค่า 0 หมายถึงไม่เว้นจริง ๆ ไม่ถูกแทนด้วยค่าเริ่มต้น ดูรูปแบบ props ใน fixture
ความสูงแถวตามเนื้อหาที่สูงที่สุดรวม padding ไม่ใช่ความสูงภาพต้นฉบับ

เซลล์รวมใช้ columnIndex เริ่ม 0, rowSpan/colSpan เริ่มต้น 1
หากใช้ explicit placement ให้ประกาศตำแหน่งทุกเซลล์ ไม่ใส่ placeholder ทับพื้นที่ที่ถูกรวม
ต้องไม่มีช่องว่าง ทับกัน หรือ span เลยขอบ; rowSpan ห้ามข้ามหัวตารางหรือแตะแถวที่ repeat
แนวนอนรวมภายในแถว repeat ได้

`allowBreak:true` ต่อเนื้อหาข้ามหน้าตามจุดตัดที่วัดได้ ข้อความตัดทั้งบรรทัด
ภาพไม่ถูกหั่นกลางรูป เซลล์ที่จบแล้วอาจว่างใน fragment หน้าถัดไป
`allowBreak:false` ย้ายแถวทั้งแถว และ fail ถ้าแถวนั้นใหญ่เกินหนึ่งหน้าที่ใช้ได้
`repeatHeaderRows:true` แสดงหัวตารางซ้ำตามสัญญาตาราง ไม่ใช่สร้างรายการธุรกิจใหม่
หัวตาราง/ภาพที่ใหญ่จนวางไม่ได้เป็นข้อผิดพลาด ไม่ลดสเกลทั้งเอกสารเงียบ ๆ

## 5. Array สำหรับรูปหลายรูปและรูปแบบคงที่

ภาพหนึ่งตัวแปรยังหมายถึงภาพหนึ่งรูป หากต้องการหลายรูปประกาศ array ของ object:

```json
{"type":"array","items":{"type":"object","fields":{
  "photo":{"type":"image","required":true},
  "caption":{"type":"string"}
}}}
```

ผู้เรียกส่ง `[{"photo":"resource UUID","caption":"คำบรรยาย"}, ...]`
ผู้สร้างใช้ `repeats` เพื่อทำแถวซ้ำ หรือ `cellRepeats` เพื่อทำช่วง node ภายในเซลล์ซ้ำ
เช่น photo → caption ต่อรายการ โดย binding ในช่วงนั้นใช้ scope item
ดู [fixture cell-repeats](../fixtures/cell-repeats/template.json) สำหรับตำแหน่งประกาศ
ขอบเขตช่วงและ ID จริง `[]` หมายถึงไม่มีรายการในช่วงซ้ำ

Image กำหนด width/height ในแม่แบบและ source `{scope, key}`
align เป็น left/center/right ของกรอบภาพในพื้นที่ที่รองรับ ค่าเริ่มต้น left
ภาพรักษาสัดส่วนอยู่ในกรอบ ไม่ได้ทำ text wrap รอบรูป
Service เตรียมภาพก่อนส่ง Core; Core ไม่โหลด URL หรือรับ Base64 แทน Service

## 6. Area สำหรับรายการที่เลือกรูปแบบได้

array เหมาะเมื่อทุกรายการมีโครงแบบเดียวกัน ส่วน area ใช้เมื่อแต่ละรายการเลือก
โครงย่อยของตัวเองได้ เช่น ข้อความตายตัว ตามด้วยหลักฐานภาพและคำบรรยาย

ประกาศใน fields ด้วย key ที่ผู้สร้างตั้ง เช่น:

```json
{"details":{"type":"area","areaId":"area-001"}}
```

เชื่อมจุดวางผ่าน areaId ตาม [fixture areas](../fixtures/areas/template.json)
ไม่ผูกตำแหน่งด้วยชื่อ key แต่ละตัวแปรมีจุดวางหนึ่งจุด และมีโครงย่อยที่รองรับอย่างน้อยหนึ่งรูปแบบ
นิยาม area เปล่าไม่ผ่าน validation; ข้อมูลตอนใช้งาน `details: []` ใช้ได้
ถ้าเป็น local area รูปแบบหลักนั้นเรียกซ้ำได้ โดยข้อมูลของแต่ละครั้งแยกกัน
global area ไม่ให้เรียก host ซ้ำหลายครั้งในเอกสารเดียว

`areaFormats` ใช้ ID เป็น map key แต่แต่ละรายการมี key ที่ผู้เรียกใช้เลือก
และ ownerAreaId ที่บอกเจ้าของ โครงย่อยต้องมี inputSchema แม้ fields ว่าง
รูปแบบชื่อเดียวกันต่าง area ได้ แต่ชื่อซ้ำภายใน area เดียวไม่ได้
ส่งข้อมูลดังนี้:

```json
{"details":[
  {"format":"notice","data":{}},
  {"format":"evidence","data":{"photo":"resource UUID","caption":"ผลทดสอบ"}}
]}
```

local ภายในโครงย่อยอ่าน data ของรายการนั้น ไม่อ่านค่าของรูปแบบแม่โดยอัตโนมัติ
ข้อมูลรายการย่อยผิดให้ข้ามพร้อม warning และตำแหน่งเดิมไว้ติดตาม
แต่โครงแม่แบบผิด, required ของตัว area ขาด หรือส่งชนิดของตัว area ผิด เป็น error
area ใช้ความกว้างจากพื้นที่เจ้าบ้าน ไม่กำหนดความกว้างอีกชุด
ในเซลล์ โครงย่อยวาง TextBlock/Image; บริเวณรากใช้รูปแบบที่มีตารางได้
ยังไม่รองรับ area ซ้อน โครงย่อยกลางแชร์หลาย area หรือ area ใน header/ช่วง repeat ที่ห้าม
การลบ current area ฝั่ง Service เก็บกวาดสิ่งที่ area เป็นเจ้าของ; snapshot เก่าคงอยู่

## 7. ลิงก์และสารบัญ

ตัวแปร link ส่งคำสั่งหนึ่งในสามแบบ (ไม่มี inline id ในค่าตัวแปร):

```json
{"type":"url","value":"https://example.com"}
```

```json
{"type":"link","text":"เปิดเว็บไซต์","url":"https://example.com"}
```

```json
{"type":"reference","text":"ดูหัวข้อผลทดสอบ","target":"result-001"}
```

จุดหมายเป็น TextBlock `props.anchorId` ต้องไม่ซ้ำและมีข้อความที่วางจริง
reference ไปบรรทัดแรกที่มีเนื้อหาของจุดหมายนั้น แม้หัวข้ออยู่ในเซลล์หรือข้ามหน้า
URL รองรับ HTTP/HTTPS ตาม validation ไม่ใช่โค้ดหรือคำสั่งให้รัน

สารบัญใช้ model 8 ขึ้นไป: กำหนด `props.toc: {level: 1}` ให้ TextBlock ที่มี anchorId
ระดับปัจจุบัน 1–3 แล้วใส่ root `table-of-contents` หนึ่งตัวพร้อม textStyleId
ทั้งชื่อและเลขหน้ากดไปหัวข้อได้ เลขหน้าเป็นหน้าจริงหลังจัดหน้า รวมหน้าสารบัญ
มีเลขหน้าชั่วคราวล่างขวาเมื่อใช้สารบัญ; bottom margin ต้องไม่น้อยกว่า 18 pt
ข้อจำกัดข้างต้นเป็นของ model8; model13–16 เพิ่มปก หัวท้าย และนโยบายเลขหน้า

## 8. ตรวจแม่แบบก่อนใช้

ใช้ public API จากราก package ตาม [README](../README.md#template-and-data-api):
validateTemplate → prepareGeneration → composeDocument → engine.generatePdf
ตรวจ ok และเก็บ warnings ของแต่ละขั้น ใช้ raw JSON text ตอน validate
เพื่อจับ key ซ้ำก่อน JSON.parse ทิ้งข้อมูล ค่า PreparedInput ที่บันทึกไว้ไม่ใช่หลักฐานยืนยันผู้ส่ง
และควรเก็บ request ต้นฉบับแยกสำหรับตรวจสอบ

เริ่มตรวจจากแม่แบบเล็ก ข้อมูลว่างที่อนุญาต ข้อความไทยยาว และรายการหลายหน้าของรูปแบบนั้น
ดู PDF จริงว่าตัวอักษรไม่ถูกตัด ลำดับรูป/คำบรรยายถูกต้อง และลิงก์ไปจุดหมายถูก
การผ่าน schema ไม่ได้แปลว่าทุกขนาดภาพ/line height จะวางได้
runtime PDF รองรับ Linux x64 ที่แพ็กไว้ ใช้ Service Docker สำหรับลองจาก Windows
ไม่ต้องใช้ repo เก่าหรือแปลง Sarabun เป็น JavaScript ก่อนใช้งาน


## 12. ส่วนของเล่มและรูปแบบหน้า (model12)

ตัวอย่างเต็ม: [แม่แบบ](../fixtures/page-sections/template.json) และ
[ข้อมูลเรียกใช้](../fixtures/page-sections/request.json).
Model4–11 ยังคงใช้ book.page; model12 ใช้ book.defaultPageLayoutId อ้าง
pageLayouts โดยแต่ละรูปแบบประกาศ page ครบ: A4, orientation และ margin สี่ด้าน
หน่วย mm/pt ไม่ส่ง book.page คู่กับ defaultPageLayoutId

sections เป็น array ตามลำดับของเล่ม แต่ละส่วนมี id คงที่, label optional,
pageLayoutId optional (ไม่ส่งใช้อ้างอิง default) และ source:

- kind: content รับ content จาก request มีได้ไม่เกินหนึ่งส่วน
- kind: authored มี fragment/repeats/cellRepeats แบบเดิม ใช้ตัวแปร global
  และ item ภายใน repeat; ไม่รับ local ของ section และไม่สร้าง inputSchema เพิ่ม

ทุกส่วนที่มี root เริ่มหน้าใหม่ตามรูปแบบหน้าของส่วนนั้น ส่วนที่ไม่มี root หลัง
Area[] ขยายจะไม่สร้างหน้า ทั้งเล่มไม่มี root ให้ EMPTY_CONTENT
การตัดสินนี้ดู root ไม่ใช่หมึกที่มองเห็น: TextBlock ว่างหรือ table root ว่างที่ผู้สร้าง
ประกาศยังคงพฤติกรรมของ node เดิม ไม่ตัดทิ้งเอง

Request ยังเป็น docKey/version/data/content; ต้องส่ง content เป็น array เสมอ
ส่ง [] ได้เมื่อส่วน authored ประกอบแล้วมี root; ถ้าไม่มี content section แต่ส่ง
รายการ content มา จะถูกปฏิเสธ formats ว่างได้เฉพาะแม่แบบที่ไม่มี content section
ผู้เรียกไม่ต้องส่ง sections/pageLayouts หรือกราฟ node

global Area มีจุดวางเดียวรวมทั้ง authored sections และ formats รูปในส่วน authored
ใช้ image variable เดิมและต้องเตรียม resource เช่นเดียวกับรูปใน content
sourceMap model12 มี origin: content หรือ authored และ sectionId; authored ไม่มี
contentIndex/format ปลอม ส่วน content เก็บ original index หลังข้ามรายการ
Resolved sections เก็บ page ที่ normalize แล้วและ rootIds ซึ่งรวมกันตรงกับ rootIds เล่ม

สารบัญและ anchor ยังอ้างทั้งเล่ม ลิงก์ข้ามส่วนจึงใช้หน้าจริงใน PDF
เลขหน้าชั่วคราวจากสารบัญยังเป็นเลขหน้าจริง และทุกส่วนต้องมีขอบล่างอย่างน้อย18pt
เมื่อใช้เลขหน้าชั่วคราวนี้ ยังไม่มี cover role, fixed-height, คำสั่งหน้าเปล่า,
หัวท้าย หรือการเริ่มนับเลขหน้าใหม่ใน model12 รอบนี้

## Model13: ปก กล่องจองความสูง และหน้าเปล่า

ใช้ `nodeModelVersion:13` ร่วมกับ pageLayouts/sections แบบ model12
กำหนด `role:"cover"` ที่ section แรกเท่านั้นและใช้ authored source
ปกเกิดหนึ่งหน้าเสมอแม้ไม่มี root; ปกล้นหยุดด้วย LAYOUT_FAILED พร้อมต้นทาง
หัวข้อทุกระดับบนปกไม่เข้าสารบัญอัตโนมัติ แต่ anchor บนปกยังเป็นปลายทางลิงก์ได้

TextBlock ที่เป็น root โดยตรงบนปกใช้ props ต่อไปนี้ได้:

```json
{"textStyleId":"body","heightMode":"fixed","height":{"value":30,"unit":"mm"},"verticalAlign":"center"}
```

height ต้องมากกว่า0 หน่วย mm/pt, verticalAlign เป็น top(default)/center/bottom
กรอบว่างยังจองความสูง; explicit line-break ใช้พื้นที่บรรทัดตามปกติ
ข้อความเกินกรอบหรือผลรวมเกินปกหยุดออก PDF ไม่ตัด/ย่อหรือดันไปหน้าต่อ
fixed ไม่รองรับใน Area formats, cells, body หรือ content formats
ไม่ส่ง heightMode หรือใช้ content เป็นการสูงตามเนื้อหาเดิม; ห้ามส่ง height/verticalAlign
ร่วมกับ content และห้ามส่ง sizing เดิมร่วมกับ fixed

แทรกหน้าเปล่าด้วย section `{"id":"blank-1","source":{"kind":"blank"}}`
หนึ่ง section เท่ากับหนึ่งหน้า ไม่มี fragment; ใช้ pageLayoutId ตามปกติ
body ว่างยังข้าม แต่ cover/blank ที่ประกาศชัดเจนไม่ข้าม
ปกไม่นับเลข; หน้าถัดไปเริ่ม1 หน้า blank ถูกนับแต่ไม่วาดเลข
เลขท้ายหน้าชั่วคราวยังเกิดเมื่อมี TOC และใช้เลขเดียวกับสารบัญ
ลิงก์ใช้หน้าจริงเสมอ model4–12 คงพฤติกรรมเดิม

ตัวอย่างครบ: fixtures/cover-pages/template.json และ request.json
ขอบเขตการพัฒนาร่วมอยู่ใน Project Control docs/domains/flowdoc-page-system-r2-design-2026-10-10.md


## หัวท้ายกระดาษ — model14

ตัวอย่างครบ: fixtures/page-bands/template.json และ request.json.
Template header/footer แต่ละชุดประกอบด้วย inputSchema, fragment,
baseTextStyleId (style ที่มีอยู่), gap และ sizing แบบเลือกได้.
request.header/request.footer แยกจาก request.data; ปกยังอ่าน data.
field-ref scope global ภายในหัว/ท้ายอ่านชุดของพื้นที่นั้น ไม่ค้นข้ามไป data.
ไม่ส่ง object ถือเป็น {} แล้วตรวจ required/default ตาม field.

รองรับ TextBlock, Image และ Columns หนึ่งชั้นในหัวท้ายเท่านั้น.
Columns มี props.gap และ columns:[{weight,childIds}]; weight เป็นบวกและแบ่ง
ความกว้างที่เหลือหลัง gap. ลูกเป็นข้อความ/ภาพ วางบนลงล่าง ชิดบน.
ไม่รองรับ Table, Area, repeat, anchor หรือ TOC heading ในหัวท้าย.

section.headerMode/footerMode: all(default), first, continuation, none.
Cover/blank ไม่แสดงหรือจองพื้นที่; section ว่างไม่สร้างหน้าเพราะหัวท้าย.
content sizing เป็นค่าเริ่มต้น: สูงขั้นต่ำหนึ่งบรรทัดของ baseTextStyleId.
เลือก minHeight/maxHeight ได้; fixed ใช้ height และห้ามใส่ min/max ร่วม.
หน่วย mm/pt; gap เริ่ม0. ความสูงพร้อม gap ของสองส่วนรวมกันไม่เกิน40%
ของพื้นที่ภายใน margins ของหน้าที่แสดงจริง; overflow เป็น LAYOUT_FAILED.
เลขหน้าชั่วคราวยังอยู่ในขอบล่างภายนอกพื้นที่ footer; ระบบเลขหน้าเต็มอยู่ใน R4.


## เริ่มแม่แบบใหม่ด้วย model16: Section และเลขหน้า

ตัวอย่างครบ: [แม่แบบ](../fixtures/page-numbering/template.json) และ
[request](../fixtures/page-numbering/request.json). ใช้ `nodeModelVersion:16`.
`book.defaultPageLayoutId` อ้างรูปแบบใน `pageLayouts`; แต่ละ section มี id คงที่
และ key ที่ผู้เรียก API ใช้. เปลี่ยนแนวตั้ง/นอนโดยเลือก pageLayoutId ของ section.
ทุก section ที่มีเนื้อหาเริ่มหน้าใหม่; section ที่ไม่มี root หลังขยายข้อมูลไม่สร้างหน้า.

แต่ละ section มี inputSchema, formats และ header/footer ของตัวเอง.
`data` ระดับเล่มเป็น global; request.sections.<key>.data คือ section,
ส่วน header/footer ใน section เป็นข้อมูลหัวท้าย. ไม่มี fallback ข้ามชุด.
ข้อความคงที่กับ field-ref อยู่รวมใน TextBlock ได้. ผู้เรียกไม่ส่งกราฟจัดหน้า.
ปกใช้ข้อมูล global หรือ section ตาม scope ที่ผู้สร้างอ้าง และไม่แสดงหัวท้าย.

```json
{
  "docKey": "page-numbering",
  "version": 1,
  "data": {"projectName": "ชื่อโครงการ"},
  "sections": {
    "body": {"data": {}, "header": {}, "footer": {}, "content": []}
  }
}
```

นี่เป็นรูป envelope เท่านั้น คีย์และค่าที่จำเป็นต้องตรง schema ของแม่แบบจริง.
ใช้ request ตัวอย่างหรือ GET contract ของ Service เป็นฐานในการกรอก.
Unknown section key ทำให้คำขอไม่ผ่าน; ลำดับ section มาจากแม่แบบเสมอ.
Models4–14 ใช้ envelope เดิม ไม่แปลงอัตโนมัติเมื่ออัปเกรด package.

ผู้สร้างใส่ใบข้อความพิเศษนี้ใน TextBlock ของหัว/ท้าย:

```json
{"id":"page-current","type":"system-page-field","field":"current","width":{"value":12,"unit":"mm"}}
```

เปลี่ยน field เป็น total เพื่อแสดงจำนวนหน้าที่ร่วมการนับทั้งเล่ม. ผู้เรียก API
ไม่ส่งค่าระบบเหล่านี้. width ต้องเป็นบวก; ไม่พอวางตัวเลขให้ LAYOUT_FAILED
ไม่มีการบีบตัวเลขหรือจัดหน้าใหม่เพื่อให้ผ่าน.

Section numbering ใช้ `{ "mode":"continue", "visibility":"show" }` เป็นค่าเริ่มต้น.
restart เริ่ม1 หรือ startAt ที่เป็นจำนวนเต็มบวก; exclude ไม่นับเลข.
Cover ไม่นับ/ไม่แสดง; blank นับ/ซ่อนตามค่าเริ่มต้น. visibility hide คงพื้นที่
แต่ซ่อนทั้ง TextBlock ที่มี system-page-field รวมข้อความประกอบในกล่องนั้น.
ไม่มี field หมายถึงไม่มีเลขท้ายอัตโนมัติใน model16. current ใช้กับ exclude ไม่ได้.

สารบัญใช้ TextBlock ที่กำหนด anchorId และ toc.level1–3. ปกไม่เข้าสารบัญ.
หัวข้อในหน้าซ่อนเลขยังมีเลขนับในสารบัญ; หน้า exclude แสดงชื่อที่กดได้แต่ช่องเลขว่าง.
ชื่อและเลขไปบรรทัดแรกของจุดหมายจริง รวมหัวตารางซ้ำและหัวข้อใน Area.
เลขแสดงซ้ำจาก restart ไม่ทำให้ปลายทางสับสน. ชื่อยาวขึ้นหลายบรรทัด/หลายหน้าได้.
เลขหัวข้อแบบ1.1/1.1.1 ยังไม่ได้สร้างอัตโนมัติในรุ่นนี้.

## Compatibility และการอัปเกรด 0.2.0

Package version, nodeModelVersion และ version ของแม่แบบเป็นคนละค่า.
อัปเกรด package ไม่เปลี่ยนแม่แบบ model4–15 หรือ snapshot ที่ publish แล้ว.
จะย้ายแม่แบบเก่าเป็น16 ต้องปรับ envelope/scopes/sections ให้ครบแล้ว validate
และ publish เวอร์ชันใหม่. คู่มือเก่าแบบ content ระดับบนยังใช้กับ model เก่าตามเดิม.
ยังไม่มี DOCX, frontend, ตารางซ้อน/Columnsในcell, TOCระดับ4ขึ้นไป,
เลขโรมัน หรือการรับรองโหลดพร้อมกันระดับ production.
