// Cloudflare Worker làm proxy giấu API key của Google Gemini
// Deploy: xem file worker/README.md
// Biến môi trường cần set: GEMINI_KEY (lấy ở https://ai.google.dev/gemini-api/docs/api-key)
// Tuỳ chọn: ALLOW_ORIGIN (mặc định "https://hoanghiencosmetics.com")

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || "https://hoanghiencosmetics.com";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);
    if (!env.GEMINI_KEY) return json({ error: "Chưa cấu hình GEMINI_KEY trên Worker" }, 500, cors);

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
      const products = Array.isArray(body.products) ? body.products.slice(0, 200) : [];
      const shop = body.shop || { name: "Mỹ Phẩm Hoàng Hiền", phone: "0789 686 111" };

      if (!messages.length) return json({ error: "Thiếu messages" }, 400, cors);

      // Rút gọn thông tin SP để tiết kiệm token
      const catalog = products.map(p => {
        const parts = [p.name];
        if (p.brand) parts.push("hãng " + p.brand);
        if (p.origin) parts.push(p.origin);
        if (p.volume) parts.push(p.volume);
        if (p.skinType) parts.push("da " + p.skinType);
        if (p.category) parts.push("loại " + p.category);
        parts.push((p.price || 0).toLocaleString("vi-VN") + "đ");
        parts.push("tồn " + (p.stock || 0));
        if (p.note) parts.push("mô tả: " + String(p.note).slice(0, 200));
        return "• " + parts.join(" | ");
      }).join("\n");

      const systemPrompt = `Bạn là trợ lý tư vấn mỹ phẩm của ${shop.name} (SĐT/Zalo ${shop.phone}).
Phong cách: thân thiện, chuyên nghiệp, trả lời bằng tiếng Việt, ngắn gọn súc tích (dưới 150 từ).
QUY TẮC:
1. Chỉ gợi ý sản phẩm có trong danh mục dưới. KHÔNG bịa sản phẩm không có.
2. Khi gợi ý, nêu rõ: tên SP, giá, lý do phù hợp. Có thể gợi ý 1-3 SP tuỳ câu hỏi.
3. Nếu khách hỏi SP không có trong danh mục → nói thật là shop chưa có, gợi ý sản phẩm thay thế gần nhất nếu phù hợp.
4. Nếu không chắc chắn về da/vấn đề của khách, hỏi thêm (loại da, mối quan tâm, ngân sách).
5. Luôn kết thúc bằng câu mời khách đặt hàng hoặc nhắn Zalo nếu cần tư vấn kỹ hơn.
6. KHÔNG tư vấn y tế, không chẩn đoán bệnh. Nếu da có vấn đề nặng → khuyên khám bác sĩ da liễu.

Danh mục sản phẩm hiện có (${products.length} SP):
${catalog}`;

      const contents = [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Vâng, mình đã nắm danh mục. Mình sẽ tư vấn khách theo đúng SP shop đang có ạ." }] },
        ...messages.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: String(m.content || "").slice(0, 1000) }]
        }))
      ];

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${env.GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 500, topP: 0.9 },
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" }
            ]
          })
        }
      );

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        return json({ error: "Gemini lỗi " + resp.status, detail: errText.slice(0, 300) }, 502, cors);
      }

      const data = await resp.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Xin lỗi, mình chưa trả lời được. Thử câu khác hoặc nhắn Zalo shop giúp mình nhé.";

      return json({ reply }, 200, cors);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500, cors);
    }
  }
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors }
  });
}
