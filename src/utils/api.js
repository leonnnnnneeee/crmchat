/**
 * A safe fetch wrapper to catch API endpoints that accidentally return HTML
 * instead of JSON (like 404 pages or server misconfigurations).
 */
export async function safeFetch(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    // Network errors (CORS, offline, etc.)
    throw error;
  }

  // Handle Server Sent Events (SSE) / Streams separately.
  // DO NOT parse them as JSON!
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    return response;
  }

  let textPreview = "";
  try {
    // Read response as text first, so we can check if it's HTML
    textPreview = await response.text();
  } catch (e) {
    // Ignore text parse errors, unlikely
  }

  const isHtml = contentType.includes("text/html") || textPreview.trim().toLowerCase().startsWith("<!doctype");

  if (isHtml) {
    const errorDetails = {
      ok: false,
      code: "API_RETURNED_HTML",
      error: "API route returned HTML instead of JSON. The backend route may be missing or misconfigured.",
      status: response.status,
      url: url,
      contentType: contentType,
      preview: textPreview.substring(0, 300)
    };
    
    const err = new Error("API route returned HTML instead of JSON. The backend route may be missing or misconfigured.");
    err.details = errorDetails;
    Object.assign(err, errorDetails);
    
    // Log for debugging as requested by the user
    console.error("[API_ERROR] HTML returned instead of JSON:", {
      ...errorDetails,
      method: options.method || 'GET'
    });
    
    // Throw a custom object so calling code can catch it properly without breaking
    throw err;
  }

  // If it's not HTML, try to parse the text as JSON
  try {
    if (!textPreview) {
      return {}; // Empty response
    }
    const data = JSON.parse(textPreview);
    
    // If the server explicitly returned an error JSON but response was ok
    // (some APIs return 200 OK with { ok: false, error: "..." }), we return the JSON
    // The calling code can check data.ok
    
    // If response was not HTTP 2xx, we can attach the status to the data
    if (!response.ok && typeof data === 'object') {
      data.__httpStatus = response.status;
    }
    
    return data;
  } catch (parseError) {
    const errorDetails = {
      ok: false,
      code: "API_JSON_PARSE_ERROR",
      error: "Failed to parse API response as JSON",
      status: response.status,
      url: url,
      preview: textPreview.substring(0, 300)
    };
    const err = new Error("Failed to parse API response as JSON");
    err.details = errorDetails;
    Object.assign(err, errorDetails);
    console.error("[API_ERROR] JSON Parse Error:", errorDetails);
    throw err;
  }
}
