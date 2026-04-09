package com.bropedia.app

import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    private lateinit var webView: WebView
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Находим WebView
        try {
            webView = findViewById(android.R.id.content).getChildAt(0) as WebView
            
            // Увеличиваем таймаут до 60 секунд
            webView.settings.setProperty("http.timeout", "60000")
            
            // Добавляем обработчик ошибок
            webView.webViewClient = object : WebViewClient() {
                override fun onReceivedError(
                    view: WebView?,
                    errorCode: Int,
                    description: String?,
                    failingUrl: String?
                ) {
                    if (errorCode == ERROR_TIMEOUT) {
                        // Показываем сообщение о долгой загрузке вместо ошибки
                        val html = """
                            <html><body style="text-align:center; padding:50px; font-family:sans-serif;">
                            <h2>🔄 Сервер просыпается</h2>
                            <p>Подожди ещё 20-30 секунд, бро...</p>
                            <p>Нажми <a href="javascript:location.reload()">сюда</a>, чтобы попробовать снова</p>
                            </body></html>
                        """
                        webView?.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
