const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, 
        Header, Footer, AlignmentType, LevelFormat, ExternalHyperlink, 
        TableOfContents, HeadingLevel, BorderStyle, WidthType, 
        ShadingType, VerticalAlign, PageNumber, PageBreak } = require('docx');
const fs = require('fs');

// Define colors - Midnight Code palette for tech document
const colors = {
  primary: "020617",       // Midnight Black - Titles
  body: "1E293B",          // Deep Slate Blue - Body text
  secondary: "64748B",     // Cool Blue-Gray - Subtitles
  accent: "94A3B8",        // Steady Silver - UI/Decor
  tableBg: "F8FAFC",       // Glacial Blue-White - Table background
  linkColor: "2563EB"      // Blue for links
};

// Table borders
const tableBorder = { style: BorderStyle.SINGLE, size: 8, color: colors.accent };
const cellBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };
const noBorders = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } };

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal",
        run: { size: 48, bold: true, color: colors.primary, font: "Times New Roman" },
        paragraph: { spacing: { before: 400, after: 200 }, alignment: AlignmentType.CENTER } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, color: colors.primary, font: "Times New Roman" },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, color: colors.body, font: "Times New Roman" },
        paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: colors.secondary, font: "Times New Roman" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
      { id: "CodeBlock", name: "Code Block", basedOn: "Normal",
        run: { size: 18, font: "Courier New", color: colors.body },
        paragraph: { spacing: { before: 100, after: 100 } } }
    ]
  },
  numbering: {
    config: [
      { reference: "bullet-list", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbered-list-1", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbered-list-2", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbered-list-3", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "numbered-list-4", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
    ]
  },
  sections: [
    // COVER PAGE
    {
      properties: { page: { margin: { top: 0, right: 0, bottom: 0, left: 0 } } },
      children: [
        new Paragraph({ spacing: { before: 3000 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 1000, after: 400 },
          children: [new TextRun({ text: "Dünya Genelinde Trafik Kameraları", size: 56, bold: true, color: colors.primary, font: "Times New Roman" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: "ve Hız Tuzakları Veritabanı", size: 48, bold: true, color: colors.primary, font: "Times New Roman" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 800 },
          children: [new TextRun({ text: "Expo & Supabase Entegrasyon Kılavuzu", size: 28, color: colors.secondary, font: "Calibri" })]
        }),
        new Paragraph({ spacing: { before: 1500 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Ücretsiz ve Açık Kaynak Veri Kaynakları", size: 24, color: colors.body, font: "Calibri" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "API Entegrasyonları & Kod Örnekleri", size: 24, color: colors.body, font: "Calibri" })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Supabase Veritabanı Şeması", size: 24, color: colors.body, font: "Calibri" })]
        }),
        new Paragraph({ spacing: { before: 2000 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "2025", size: 22, color: colors.accent, font: "Calibri" })]
        }),
        new Paragraph({ children: [new PageBreak()] })
      ]
    },
    // MAIN CONTENT
    {
      properties: { page: { margin: { top: 1800, right: 1440, bottom: 1440, left: 1440 } } },
      headers: {
        default: new Header({ children: [new Paragraph({ 
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "Trafik Kameraları Veritabanı Kılavuzu", size: 20, color: colors.secondary, font: "Calibri" })]
        })] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ 
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Sayfa ", size: 20, color: colors.secondary }), new TextRun({ children: [PageNumber.CURRENT], size: 20, color: colors.secondary }), new TextRun({ text: " / ", size: 20, color: colors.secondary }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 20, color: colors.secondary })]
        })] })
      },
      children: [
        // TABLE OF CONTENTS
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun("İçindekiler")] }),
        new TableOfContents("İçindekiler", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 400 },
          children: [new TextRun({ text: "Not: İçindekiler tablosu otomatik olarak oluşturulmuştur. Sayfa numaralarını güncellemek için tabloya sağ tıklayıp \"Alanı Güncelle\" seçeneğini kullanın.", size: 18, color: colors.accent, font: "Calibri" })]
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // SECTION 1: OVERVIEW
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("1. Genel Bakış")] }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: "Bu kılavuz, dünya genelinde trafik kameraları ve hız tuzakları verilerini ücretsiz olarak toplamak ve uygulamanızda kullanmak için kapsamlı bir kaynak sunmaktadır. Expo/React Native ile Supabase entegrasyonu için pratik kod örnekleri ve en iyi uygulamalar içermektedir. Mobil uygulamanızın iOS ve Android platformlarında yayınlanması hedeflenmektedir ve bu belge, gerçek zamanlı trafik kamera verilerine erişim sağlamanıza yardımcı olacaktır.", font: "Calibri", size: 22 })]
        }),
        new Paragraph({
          spacing: { before: 100, after: 200 },
          children: [new TextRun({ text: "Trafik kameraları ve hız tuzakları verileri, sürücülerin güvenli sürüş yapmalarına yardımcı olmak ve trafik cezalarından kaçınmak için kritik öneme sahiptir. Bu veriler, farklı kaynaklardan toplanarak birleştirilebilir ve kullanıcılara gerçek zamanlı uyarılar sunmak için kullanılabilir. Aşağıda, bu verileri ücretsiz olarak edinmenin en etkili yollarını detaylı olarak açıklanmaktadır.", font: "Calibri", size: 22 })]
        }),

        // SECTION 2: DATA SOURCES
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("2. Ücretsiz Veri Kaynakları")] }),
        new Paragraph({
          spacing: { before: 100, after: 200 },
          children: [new TextRun({ text: "Aşağıda, dünya genelinde trafik kameraları ve hız tuzakları verilerine erişim sağlayan ücretsiz ve açık kaynak platformlar listelenmiştir. Her bir kaynağın avantajları, dezavantajları ve kullanım yöntemleri detaylı olarak açıklanmaktadır.", font: "Calibri", size: 22 })]
        }),

        // 2.1 OpenStreetMap
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2.1 OpenStreetMap (OSM) - Overpass API")] }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: "OpenStreetMap, dünyanın en büyük açık haritalama projesidir ve topluluk tarafından sürdürülen kapsamlı trafik kameraları veritabanına sahiptir. Overpass API, OSM verilerini sorgulamak için kullanılan güçlü bir API'dir ve belirli etiketlere göre veri filtrelemeye olanak tanır. Bu kaynak tamamen ücretsizdir ve herhangi bir API anahtarı gerektirmez, ancak kullanım sınırlamaları bulunmaktadır.", font: "Calibri", size: 22 })]
        }),
        new Paragraph({ spacing: { before: 100, after: 100 }, children: [new TextRun({ text: "Avantajlar:", bold: true, font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Tamamen ücretsiz ve açık kaynak", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Dünya genelinde kapsam", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "API anahtarı gerektirmez", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "JSON formatında çıktı", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Düzenli topluluk güncellemeleri", font: "Calibri", size: 22 })] }),
        new Paragraph({ spacing: { before: 100, after: 100 }, children: [new TextRun({ text: "Dezavantajlar:", bold: true, font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Rate limiting (dakikada maksimum istek sayısı)", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Veri kalitesi bölgeden bölgeye değişebilir", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Mobil kameralar genellikle dahil değildir", font: "Calibri", size: 22 })] }),

        new Paragraph({ spacing: { before: 150, after: 100 }, children: [new TextRun({ text: "Overpass API Örnek Sorgu:", bold: true, font: "Calibri", size: 22 })] }),
        new Paragraph({
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          spacing: { before: 50, after: 50 },
          indent: { left: 200, right: 200 },
          children: [new TextRun({ text: `[out:json][timeout:25];
(
  node["highway"="speed_camera"]({{bbox}});
  node["enforcement"="maxspeed"]({{bbox}});
  node["enforcement"="traffic_signals"]({{bbox}});
);
out body;`, font: "Courier New", size: 18 })]
        }),
        new Paragraph({
          spacing: { before: 100, after: 200 },
          children: [new TextRun({ text: "OSM Wiki'de hız kameraları için kullanılan etiketler detaylı olarak açıklanmaktadır. highway=speed_camera etiketi sabit hız kameralarını, enforcement=maxspeed ise hız denetim noktalarını belirtir. Bu etiketleri kullanarak dünya genelindeki tüm kameraları çekebilirsiniz.", font: "Calibri", size: 22 })]
        }),

        // 2.2 Lufop
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2.2 Lufop API")] }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: "Lufop, Avrupa'nın en kapsamlı ücretsiz hız kamerası veritabanlarından biridir. 20'den fazla ülkede aktif kameraların konumlarını sunmaktadır. Topluluk tarafından güncellenen bu veritabanı, aylık olarak test edilmekte ve doğrulanmaktadır. API erişimi tamamen ücretsizdir ve GPS uygulamaları için ideal bir kaynaktır.", font: "Calibri", size: 22 })]
        }),
        new Paragraph({ spacing: { before: 100, after: 100 }, children: [new TextRun({ text: "Kapsanan Ülkeler:", bold: true, font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Fransa, İngiltere, Belçika, Hollanda", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Almanya, İspanya, İtalya, Portekiz", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "İsviçre, Avusturya, Polonya, Çekya", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "İsveç, Norveç, Danimarka, Finlandiya", font: "Calibri", size: 22 })] }),
        new Paragraph({ spacing: { before: 100, after: 100 }, children: [new TextRun({ text: "Kamera Türleri:", bold: true, font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Sabıt hız kameraları (Fixed speed cameras)", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Kırmızı ışık kameraları (Red light cameras)", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Ortalama hız ölçüm noktaları (Average speed)", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Mobil kamera bölgeleri (Mobile zones)", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "İnşaat alanı kameraları (Construction zone)", font: "Calibri", size: 22 })] }),

        // 2.3 Government Open Data
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2.3 Hükümet Açık Veri Portalları")] }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: "Birçok ülke, trafik kameraları ve hız tuzakları verilerini resmi açık veri portalları üzerinden paylaşmaktadır. Bu kaynaklar genellikle en doğru ve güncel verileri sağlar, çünkü doğrudan yetkili kurumlar tarafından yayınlanmaktadır. Ancak her ülkenin veri formatı ve erişim yöntemi farklı olabilir ve bu nedenle entegrasyon daha karmaşık olabilmektedir.", font: "Calibri", size: 22 })]
        }),

        new Table({
          columnWidths: [3000, 3200, 3160],
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                new TableCell({ borders: cellBorders, shading: { fill: colors.tableBg, type: ShadingType.CLEAR }, verticalAlign: VerticalAlign.CENTER, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Ülke", bold: true, size: 22 })] })] }),
                new TableCell({ borders: cellBorders, shading: { fill: colors.tableBg, type: ShadingType.CLEAR }, verticalAlign: VerticalAlign.CENTER, width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Portal", bold: true, size: 22 })] })] }),
                new TableCell({ borders: cellBorders, shading: { fill: colors.tableBg, type: ShadingType.CLEAR }, verticalAlign: VerticalAlign.CENTER, width: { size: 3160, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Veri Türü", bold: true, size: 22 })] })] })
              ]
            }),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ABD", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "data.gov", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3160, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Trafik kameraları", size: 20 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Avustralya", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "data.act.gov.au", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3160, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Hız kameraları", size: 20 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Kanada", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ouvert.canada.ca", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3160, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Trafik kameraları", size: 20 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Hindistan", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "data.gov.in", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3160, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Kameralar", size: 20 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "İngiltere", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "data.gov.uk", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3160, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Hız kameraları", size: 20 })] })] })
            ]}),
            new TableRow({ children: [
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Avustralya (VIC)", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "vic.gov.au", size: 20 })] })] }),
              new TableCell({ borders: cellBorders, verticalAlign: VerticalAlign.CENTER, width: { size: 3160, type: WidthType.DXA }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Yol güvenliği kameraları", size: 20 })] })] })
            ]})
          ]
        }),
        new Paragraph({ spacing: { before: 50, after: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Tablo 1: Hükümet Açık Veri Portalları", size: 18, color: colors.secondary, italics: true })] }),

        // 2.4 GitHub Projects
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("2.4 GitHub Açık Kaynak Projeleri")] }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: "GitHub üzerinde topluluk tarafından geliştirilen çeşitli projeler, hız kamerası verilerini toplamak ve dağıtmak için kullanılabilir. Bu projeler genellikle birden fazla kaynaktan veri birleştirir ve düzenli olarak güncellenir. Açık kaynak olması sayesinde projeleri kendi ihtiyaçlarınıza göre özelleştirebilirsiniz.", font: "Calibri", size: 22 })]
        }),
        new Paragraph({ spacing: { before: 100, after: 100 }, children: [new TextRun({ text: "Önerilen Projeler:", bold: true, font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-1", level: 0 }, children: [new TextRun({ text: "Open-GATSO-POI: Avrupa hız kameraları için günlük güncellenen veritabanı", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-1", level: 0 }, children: [new TextRun({ text: "catchcam: Offline hız kamerası dedektörü için veritabanı", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-1", level: 0 }, children: [new TextRun({ text: "waze_traffic_api: Waze verilerinden polis ve kamera raporları", font: "Calibri", size: 22 })] }),

        // SECTION 3: SUPABASE SCHEMA
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("3. Supabase Veritabanı Şeması")] }),
        new Paragraph({
          spacing: { before: 100, after: 200 },
          children: [new TextRun({ text: "Supabase, PostgreSQL tabanlı bir Backend-as-a-Service platformudur ve gerçek zamanlı veri senkronizasyonu, yerel JSON desteği ve güçlü sorgulama yetenekleri sunar. Aşağıda, trafik kameraları verileri için optimize edilmiş bir veritabanı şeması önerisi sunulmaktadır. Bu şema, farklı kaynaklardan gelen verileri standartlaştırmak ve verimli sorgulama yapmak için tasarlanmıştır.", font: "Calibri", size: 22 })]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.1 Ana Tablolar")] }),
        new Paragraph({
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          spacing: { before: 50, after: 50 },
          indent: { left: 200, right: 200 },
          children: [new TextRun({ text: `-- Ülkeler tablosu
CREATE TABLE countries (
  id SERIAL PRIMARY KEY,
  iso_code VARCHAR(3) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Kamera türleri
CREATE TYPE camera_type AS ENUM (
  'speed_fixed',       -- Sabit hız kamerası
  'speed_mobile',      -- Mobil hız kamerası
  'red_light',         -- Kırmızı ışık kamerası
  'speed_average',     -- Ortalama hız ölçüm
  'traffic_light',     -- Trafik ışığı kamerası
  'construction',      -- İnşaat alanı
  'police'             -- Polis kontrol noktası
);

-- Ana kameralar tablosu
CREATE TABLE traffic_cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  camera_type camera_type NOT NULL,
  speed_limit INTEGER,
  road_name VARCHAR(255),
  direction INTEGER,
  country_id INTEGER REFERENCES countries(id),
  source VARCHAR(50) NOT NULL,
  source_id VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  verified BOOLEAN DEFAULT false,
  last_verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Konum indeksi
  CONSTRAINT valid_coordinates 
    CHECK (latitude BETWEEN -90 AND 90 
       AND longitude BETWEEN -180 AND 180)
);

-- Konum tabanlı sorgular için GIST indeksi
CREATE INDEX idx_cameras_location 
  ON traffic_cameras USING GIST (
    point(longitude, latitude)
  );`, font: "Courier New", size: 16 })]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("3.2 Ek Tablolar ve İndeksler")] }),
        new Paragraph({
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          spacing: { before: 50, after: 50 },
          indent: { left: 200, right: 200 },
          children: [new TextRun({ text: `-- Kamera güncelleme logları
CREATE TABLE camera_update_logs (
  id SERIAL PRIMARY KEY,
  camera_id UUID REFERENCES traffic_cameras(id),
  action VARCHAR(20) NOT NULL,
  old_data JSONB,
  new_data JSONB,
  changed_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Kullanıcı raporları
CREATE TABLE user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID REFERENCES traffic_cameras(id),
  user_id UUID,
  report_type VARCHAR(50) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Veri kaynağı meta bilgileri
CREATE TABLE data_sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  url VARCHAR(500),
  api_endpoint VARCHAR(500),
  update_frequency VARCHAR(50),
  last_sync TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Performans için ek indeksler
CREATE INDEX idx_cameras_country ON traffic_cameras(country_id);
CREATE INDEX idx_cameras_type ON traffic_cameras(camera_type);
CREATE INDEX idx_cameras_active ON traffic_cameras(is_active);
CREATE INDEX idx_cameras_source ON traffic_cameras(source);`, font: "Courier New", size: 16 })]
        }),

        // SECTION 4: EXPO INTEGRATION
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("4. Expo/React Native Entegrasyonu")] }),
        new Paragraph({
          spacing: { before: 100, after: 200 },
          children: [new TextRun({ text: "Expo, React Native uygulaması geliştirmek için güçlü bir framework'tür ve Supabase ile sorunsuz entegrasyon sağlar. Aşağıda, uygulamanızda kullanabileceğiniz kod örnekleri ve best practice'ler sunulmaktadır. Bu örnekler, veri çekme, önbelleğe alma ve gerçek zamanlı güncellemeler için optimize edilmiştir.", font: "Calibri", size: 22 })]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.1 Supabase Client Kurulumu")] }),
        new Paragraph({
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          spacing: { before: 50, after: 50 },
          indent: { left: 200, right: 200 },
          children: [new TextRun({ text: `// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);`, font: "Courier New", size: 16 })]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.2 Kamera Verisi Çekme Servisi")] }),
        new Paragraph({
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          spacing: { before: 50, after: 50 },
          indent: { left: 200, right: 200 },
          children: [new TextRun({ text: `// services/cameraService.ts
import { supabase } from '../lib/supabase';

export interface Camera {
  id: string;
  latitude: number;
  longitude: number;
  camera_type: string;
  speed_limit: number | null;
  road_name: string | null;
  direction: number | null;
  is_active: boolean;
  distance?: number;
}

export class CameraService {
  // Belirli bir bölgedeki kameraları getir
  static async getCamerasInBounds(
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number,
    types?: string[]
  ): Promise<Camera[]> {
    let query = supabase
      .from('traffic_cameras')
      .select('*')
      .eq('is_active', true)
      .gte('latitude', minLat)
      .lte('latitude', maxLat)
      .gte('longitude', minLng)
      .lte('longitude', maxLng);

    if (types && types.length > 0) {
      query = query.in('camera_type', types);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  // Kullanıcı konumuna yakın kameraları getir
  static async getNearbyCameras(
    lat: number,
    lng: number,
    radiusKm: number = 5
  ): Promise<Camera[]> {
    const { data, error } = await supabase.rpc('get_nearby_cameras', {
      user_lat: lat,
      user_lng: lng,
      radius_km: radiusKm
    });
    
    if (error) throw error;
    return data;
  }
}`, font: "Courier New", size: 16 })]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("4.3 PostgreSQL RPC Fonksiyonu")] }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: "Supabase'de yakın kameraları getirmek için bir PostgreSQL fonksiyonu oluşturun:", font: "Calibri", size: 22 })]
        }),
        new Paragraph({
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          spacing: { before: 50, after: 50 },
          indent: { left: 200, right: 200 },
          children: [new TextRun({ text: `CREATE OR REPLACE FUNCTION get_nearby_cameras(
  user_lat FLOAT,
  user_lng FLOAT,
  radius_km FLOAT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  latitude FLOAT,
  longitude FLOAT,
  camera_type TEXT,
  speed_limit INTEGER,
  road_name TEXT,
  distance_km FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tc.id,
    tc.latitude::FLOAT,
    tc.longitude::FLOAT,
    tc.camera_type::TEXT,
    tc.speed_limit,
    tc.road_name,
    (
      6371 * acos(
        cos(radians(user_lat)) * 
        cos(radians(tc.latitude)) * 
        cos(radians(tc.longitude) - radians(user_lng)) + 
        sin(radians(user_lat)) * 
        sin(radians(tc.latitude))
      )
    )::FLOAT AS distance_km
  FROM traffic_cameras tc
  WHERE tc.is_active = true
    AND (
      6371 * acos(
        cos(radians(user_lat)) * 
        cos(radians(tc.latitude)) * 
        cos(radians(tc.longitude) - radians(user_lng)) + 
        sin(radians(user_lat)) * 
        sin(radians(tc.latitude))
      )
    ) <= radius_km
  ORDER BY distance_km;
END;
$$ LANGUAGE plpgsql;`, font: "Courier New", size: 14 })]
        }),

        // SECTION 5: DATA COLLECTION
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("5. Veri Toplama Stratejisi")] }),
        new Paragraph({
          spacing: { before: 100, after: 200 },
          children: [new TextRun({ text: "Dünya genelinde trafik kamerası verilerini toplamak için çok kaynaklı bir yaklaşım önerilmektedir. Bu strateji, verilerin doğruluğunu, güncelliğini ve kapsama alanını artırmak için tasarlanmıştır. Aşağıda, veri toplama sürecinin adım adım uygulaması açıklanmaktadır.", font: "Calibri", size: 22 })]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.1 Overpass API'den Veri Çekme")] }),
        new Paragraph({
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          spacing: { before: 50, after: 50 },
          indent: { left: 200, right: 200 },
          children: [new TextRun({ text: `// scripts/fetchOSMCameras.ts
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

export async function fetchOSMCameras(bounds: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}) {
  const query = \`
    [out:json][timeout:60];
    (
      node["highway"="speed_camera"](\${bounds.minLat},\${bounds.minLng},\${bounds.maxLat},\${bounds.maxLng});
      node["enforcement"="maxspeed"](\${bounds.minLat},\${bounds.minLng},\${bounds.maxLat},\${bounds.maxLng});
      node["enforcement"="traffic_signals"](\${bounds.minLat},\${bounds.minLng},\${bounds.maxLat},\${bounds.maxLng});
    );
    out body;
  \`;

  const response = await fetch(OVERPASS_API, {
    method: 'POST',
    body: \`data=\${encodeURIComponent(query)}\`
  });

  const data = await response.json();
  return data.elements.map((el: any) => ({
    source: 'osm',
    source_id: \`osm_\${el.id}\`,
    latitude: el.lat,
    longitude: el.lon,
    camera_type: mapOSMType(el.tags),
    speed_limit: el.tags?.['maxspeed'] 
      ? parseInt(el.tags.maxspeed) 
      : null,
    road_name: el.tags?.['name'] || null
  }));
}

function mapOSMType(tags: any): string {
  if (tags.highway === 'speed_camera') return 'speed_fixed';
  if (tags.enforcement === 'traffic_signals') return 'red_light';
  if (tags.enforcement === 'maxspeed') return 'speed_fixed';
  return 'speed_fixed';
}`, font: "Courier New", size: 14 })]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.2 Lufop API Entegrasyonu")] }),
        new Paragraph({
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          spacing: { before: 50, after: 50 },
          indent: { left: 200, right: 200 },
          children: [new TextRun({ text: `// scripts/fetchLufopCameras.ts
const LUFOP_API = 'https://api.lufop.net/v1/cameras';

export async function fetchLufopCameras(countryCode?: string) {
  const params = new URLSearchParams();
  if (countryCode) params.append('country', countryCode);
  
  const response = await fetch(\`\${LUFOP_API}?\${params}\`);
  const data = await response.json();
  
  return data.cameras.map((cam: any) => ({
    source: 'lufop',
    source_id: \`lufop_\${cam.id}\`,
    latitude: cam.latitude,
    longitude: cam.longitude,
    camera_type: mapLufopType(cam.type),
    speed_limit: cam.speed_limit || null,
    road_name: cam.road || null,
    direction: cam.direction || null
  }));
}

function mapLufopType(type: string): string {
  const typeMap: Record<string, string> = {
    'FIXED': 'speed_fixed',
    'MOBILE': 'speed_mobile',
    'REDLIGHT': 'red_light',
    'AVERAGE': 'speed_average',
    'CONSTRUCTION': 'construction'
  };
  return typeMap[type] || 'speed_fixed';
}`, font: "Courier New", size: 14 })]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("5.3 Veri Senkronizasyon İş Akışı")] }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: "Veri senkronizasyonu için önerilen iş akışı aşağıdaki gibidir:", font: "Calibri", size: 22 })]
        }),
        new Paragraph({ numbering: { reference: "numbered-list-2", level: 0 }, children: [new TextRun({ text: "Her gün gece yarısı tam senkronizasyon çalıştırın", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-2", level: 0 }, children: [new TextRun({ text: "Kullanıcı konumuna göre önbelleğe alınmış veriyi sunun", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-2", level: 0 }, children: [new TextRun({ text: "Kullanıcı raporlarını gerçek zamanlı işleyin", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-2", level: 0 }, children: [new TextRun({ text: "Çakışan kayıtları otomatik birleştirin", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-2", level: 0 }, children: [new TextRun({ text: "Eski/inaktif kameraları düzenli olarak temizleyin", font: "Calibri", size: 22 })] }),

        // SECTION 6: OPTIMIZATION
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("6. Performans Optimizasyonu")] }),
        new Paragraph({
          spacing: { before: 100, after: 200 },
          children: [new TextRun({ text: "Mobil uygulamada yüksek performans sağlamak için veri çekme ve önbelleğe alma stratejileri kritik öneme sahiptir. Aşağıda, uygulamanızın hızlı ve verimli çalışması için önerilen optimizasyon teknikleri açıklanmaktadır.", font: "Calibri", size: 22 })]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("6.1 Önbelleğe Alma Stratejisi")] }),
        new Paragraph({
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          spacing: { before: 50, after: 50 },
          indent: { left: 200, right: 200 },
          children: [new TextRun({ text: `// hooks/useCachedCameras.ts
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraService, Camera } from '../services/cameraService';

const CACHE_KEY = 'cached_cameras';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 saat

export function useCachedCameras(
  lat: number,
  lng: number,
  radiusKm: number = 10
) {
  return useQuery({
    queryKey: ['cameras', lat, lng, radiusKm],
    queryFn: async () => {
      // Önce önbelleği kontrol et
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          return data as Camera[];
        }
      }
      
      // Önbellek yoksa veya eskiyse API'den çek
      const cameras = await CameraService.getNearbyCameras(lat, lng, radiusKm);
      
      // Önbelleğe kaydet
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
        data: cameras,
        timestamp: Date.now()
      }));
      
      return cameras;
    },
    staleTime: 5 * 60 * 1000, // 5 dakika
    gcTime: 30 * 60 * 1000, // 30 dakika
  });
}`, font: "Courier New", size: 14 })]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("6.2 Cluster ve Marker Optimizasyonu")] }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: "Harita üzerinde binlerce kamera gösterirken performansı korumak için cluster (kümeleme) tekniğini kullanın. React Native Maps kütüphanesi ile marker clustering desteği mevcuttur. Yakın kameraları gruplandırarak ve sadece kullanıcı yakınlaştırdığında detayları göstererek uygulama performansını artırabilirsiniz.", font: "Calibri", size: 22 })]
        }),

        // SECTION 7: LEGAL
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("7. Yasal Konular ve Uyarılar")] }),
        new Paragraph({
          spacing: { before: 100, after: 200 },
          children: [new TextRun({ text: "Trafik kameraları uygulaması geliştirirken dikkat edilmesi gereken önemli yasal konular bulunmaktadır. Bu konular, uygulamanızın farklı ülkelerde yasal olarak yayınlanabilmesi için kritik öneme sahiptir ve ihlali ciddi yaptırımlara yol açabilir.", font: "Calibri", size: 22 })]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("7.1 ülke Bazlı Yasaklar")] }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: "Bazı ülkelerde hız kamerası uyarı uygulamaları yasaktır veya kısıtlıdır. Bu ülkeler arasında Fransa, İsviçre ve bazı Avrupa ülkeleri öne çıkmaktadır. Uygulamanızın bu ülkelerde yasal olarak yayınlanabilmesi için aşağıdaki önlemleri almanız gerekmektedir:", font: "Calibri", size: 22 })]
        }),
        new Paragraph({ numbering: { reference: "numbered-list-3", level: 0 }, children: [new TextRun({ text: "Fransa: Hız kamerası konumlarını göstermek yasaktır, \"tehlikeli bölge\" olarak işaretleyin", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-3", level: 0 }, children: [new TextRun({ text: "İsviçre: Hız kamerası uyarı sistemleri tamamen yasaktır, App Store'da erişimi engelleyin", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-3", level: 0 }, children: [new TextRun({ text: "Almanya: Yasaldır ancak kullanıcı onayı gereklidir", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-3", level: 0 }, children: [new TextRun({ text: "Türkiye: Yasaldır, herhangi bir kısıtlama yoktur", font: "Calibri", size: 22 })] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("7.2 App Store Gereksinimleri")] }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: "Apple App Store ve Google Play Store, hız kamerası uygulamaları için özel kurallara sahiptir. Uygulamanızın mağazalardan kaldırılmaması için bu kurallara uymanız gerekmektedir:", font: "Calibri", size: 22 })]
        }),
        new Paragraph({ numbering: { reference: "numbered-list-4", level: 0 }, children: [new TextRun({ text: "Kullanıcıya açık bir şekilde veri kaynağını belirtin", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-4", level: 0 }, children: [new TextRun({ text: "Coğrafi kısıtlamaları uygulayın (ülke bazlı filtreleme)", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-4", level: 0 }, children: [new TextRun({ text: "Gizlilik politikası ve kullanım koşulları yayınlayın", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "numbered-list-4", level: 0 }, children: [new TextRun({ text: "Kullanıcı verilerini koruyun (GDPR uyumluluğu)", font: "Calibri", size: 22 })] }),

        // SECTION 8: SUMMARY
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("8. Özet ve Öneriler")] }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: "Bu kılavuzda, dünya genelinde trafik kameraları ve hız tuzakları verilerini ücretsiz olarak toplamak için kapsamlı bir yol haritası sunulmuştur. OpenStreetMap, Lufop ve hükümet açık veri portalları gibi kaynaklardan veri çekebilirsiniz. Supabase ile güçlü bir backend oluşturarak, Expo/React Native uygulamanızda bu verileri verimli bir şekilde kullanabilirsiniz.", font: "Calibri", size: 22 })]
        }),
        new Paragraph({
          spacing: { before: 100, after: 100 },
          children: [new TextRun({ text: "Önerilen Adımlar:", bold: true, font: "Calibri", size: 22 })]
        }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Öncelikle OSM verilerini kullanarak temel veritabanını oluşturun", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Lufop ile Avrupa verilerini zenginleştirin", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Hedef ülkelerin resmi veri portallarını entegre edin", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Kullanıcı raporları ile verileri güncel tutun", font: "Calibri", size: 22 })] }),
        new Paragraph({ numbering: { reference: "bullet-list", level: 0 }, children: [new TextRun({ text: "Yasal gereksinimlere mutlaka uyun", font: "Calibri", size: 22 })] }),
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: "Bu kaynakları birleştirerek, dünya genelinde kapsamlı ve güncel bir trafik kameraları veritabanı oluşturabilirsiniz. Başarılar dileriz!", font: "Calibri", size: 22 })]
        }),

        // Useful Links
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Faydalı Bağlantılar")] }),
        new Paragraph({
          spacing: { before: 100, after: 50 },
          children: [
            new TextRun({ text: "• OpenStreetMap Wiki: ", font: "Calibri", size: 22 }),
            new ExternalHyperlink({ children: [new TextRun({ text: "https://wiki.openstreetmap.org/wiki/Tag:highway=speed_camera", style: "Hyperlink", size: 22 })], link: "https://wiki.openstreetmap.org/wiki/Tag:highway=speed_camera" })
          ]
        }),
        new Paragraph({
          spacing: { before: 50, after: 50 },
          children: [
            new TextRun({ text: "• Lufop API: ", font: "Calibri", size: 22 }),
            new ExternalHyperlink({ children: [new TextRun({ text: "https://lufop.net/en/lufop-api", style: "Hyperlink", size: 22 })], link: "https://lufop.net/en/lufop-api" })
          ]
        }),
        new Paragraph({
          spacing: { before: 50, after: 50 },
          children: [
            new TextRun({ text: "• Supabase Dokümantasyon: ", font: "Calibri", size: 22 }),
            new ExternalHyperlink({ children: [new TextRun({ text: "https://supabase.com/docs", style: "Hyperlink", size: 22 })], link: "https://supabase.com/docs" })
          ]
        }),
        new Paragraph({
          spacing: { before: 50, after: 200 },
          children: [
            new TextRun({ text: "• Expo Dokümantasyon: ", font: "Calibri", size: 22 }),
            new ExternalHyperlink({ children: [new TextRun({ text: "https://docs.expo.dev", style: "Hyperlink", size: 22 })], link: "https://docs.expo.dev" })
          ]
        })
      ]
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/home/z/my-project/download/Trafik_Kameralari_Kilavuzu.docx", buffer);
  console.log("Document created successfully!");
});
