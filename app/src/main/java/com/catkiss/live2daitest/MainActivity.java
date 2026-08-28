package com.catkiss.live2daitest;

import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends AppCompatActivity {
    private static final String PREFS = "live2d_ai_test";
    private static final String DEFAULT_BASE_URL = "https://api.deepseek.com";
    private static final String DEFAULT_MODEL = "deepseek-v4-flash";
    private static final long MAX_EXTRACTED_BYTES = 1_500_000_000L;
    private static final int MAX_ZIP_ENTRIES = 8_000;
    private static final int MAX_MOBILE_TEXTURE_SIZE = 2_048;

    private static final Set<String> EMOTIONS = new HashSet<>(Arrays.asList(
            "neutral", "happy", "sad", "excited", "shy", "angry",
            "surprised", "thinking", "empathy", "love", "confused"
    ));
    private static final Set<String> ACTIONS = new HashSet<>(Arrays.asList(
            "none", "nod", "shake_head", "tilt_head", "lean_forward",
            "lean_back", "sigh", "pout", "excited_bounce"
    ));

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final JSONArray conversation = new JSONArray();

    private SharedPreferences prefs;
    private File modelRoot;
    private File runtimeRoot;
    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private LinearLayout messageList;
    private ScrollView messageScroll;
    private LinearLayout settingsPanel;
    private EditText baseUrlInput;
    private EditText apiKeyInput;
    private EditText modelIdInput;
    private EditText messageInput;
    private Button sendButton;
    private TextView statusText;
    private FrameLayout loadingOverlay;
    private TextView loadingText;

    private final ActivityResultLauncher<String[]> modelZipPicker = registerForActivityResult(
            new ActivityResultContracts.OpenDocument(), this::onModelZipPicked);
    private final ActivityResultLauncher<String[]> corePicker = registerForActivityResult(
            new ActivityResultContracts.OpenDocument(), this::onCorePicked);

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        modelRoot = new File(getFilesDir(), "live2d-model");
        runtimeRoot = new File(getFilesDir(), "cubism-runtime");
        //noinspection ResultOfMethodCallIgnored
        modelRoot.mkdirs();
        //noinspection ResultOfMethodCallIgnored
        runtimeRoot.mkdirs();

        buildUi();
        configureWebView();
        loadStage();
        addAssistantMessage("这是第一版测试。选择 Live2D 模型 ZIP 后，App 会自动联网加载官方 Cubism Core；也可以用“导入Core”设置离线 Core。然后填写 DeepSeek API Key 即可对话测试。", false);
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    private void configureWebView() {
        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/model/", new WebViewAssetLoader.InternalStoragePathHandler(this, modelRoot))
                .addPathHandler("/runtime/", new WebViewAssetLoader.InternalStoragePathHandler(this, runtimeRoot))
                .build();

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.addJavascriptInterface(new StageBridge(), "AndroidStage");
        webView.setWebViewClient(new WebViewClientCompat() {
            @Nullable
            @Override
            public WebResourceResponse shouldInterceptRequest(@NonNull WebView view,
                                                              @NonNull WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(22, 18, 32));

        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(8), dp(4), dp(8), dp(4));
        toolbar.setBackgroundColor(Color.argb(175, 21, 16, 32));

        Button modelButton = compactButton("导入模型ZIP");
        modelButton.setOnClickListener(v -> modelZipPicker.launch(new String[]{"application/zip", "application/octet-stream"}));
        toolbar.addView(modelButton);

        Button coreButton = compactButton("离线Core");
        coreButton.setOnClickListener(v -> corePicker.launch(new String[]{"application/javascript", "text/javascript", "*/*"}));
        toolbar.addView(coreButton);

        Button settingsButton = compactButton("API设置");
        settingsButton.setOnClickListener(v -> settingsPanel.setVisibility(
                settingsPanel.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));
        toolbar.addView(settingsButton);

        statusText = new TextView(this);
        statusText.setTextColor(Color.rgb(230, 218, 250));
        statusText.setTextSize(11);
        statusText.setMaxLines(2);
        statusText.setText("v0.1.3 · 等待导入");
        LinearLayout.LayoutParams statusLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        statusLp.setMarginStart(dp(6));
        toolbar.addView(statusText, statusLp);

        FrameLayout.LayoutParams toolbarLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        root.addView(toolbar, toolbarLp);

        settingsPanel = buildSettingsPanel();
        FrameLayout.LayoutParams settingsLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        settingsLp.topMargin = dp(46);
        settingsLp.leftMargin = dp(8);
        settingsLp.rightMargin = dp(8);
        root.addView(settingsPanel, settingsLp);

        LinearLayout chatPanel = buildChatPanel();
        FrameLayout.LayoutParams chatLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(220), Gravity.BOTTOM);
        chatLp.leftMargin = dp(8);
        chatLp.rightMargin = dp(8);
        chatLp.bottomMargin = dp(8);
        root.addView(chatPanel, chatLp);

        loadingOverlay = buildLoadingOverlay();
        root.addView(loadingOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);
    }

    private FrameLayout buildLoadingOverlay() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setVisibility(View.GONE);
        overlay.setClickable(true);
        overlay.setFocusable(true);
        overlay.setBackgroundColor(Color.argb(150, 8, 5, 14));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setPadding(dp(24), dp(20), dp(24), dp(20));
        card.setBackground(rounded(Color.argb(242, 39, 29, 55), 18));

        ProgressBar progress = new ProgressBar(this);
        card.addView(progress, new LinearLayout.LayoutParams(dp(46), dp(46)));
        loadingText = new TextView(this);
        loadingText.setTextColor(Color.WHITE);
        loadingText.setTextSize(14);
        loadingText.setGravity(Gravity.CENTER);
        loadingText.setPadding(0, dp(12), 0, 0);
        card.addView(loadingText, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        FrameLayout.LayoutParams cardLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        cardLp.leftMargin = dp(28);
        cardLp.rightMargin = dp(28);
        overlay.addView(card, cardLp);
        return overlay;
    }

    private LinearLayout buildSettingsPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(12), dp(10), dp(12), dp(10));
        panel.setBackground(rounded(Color.argb(220, 28, 21, 42), 16));

        baseUrlInput = field("Base URL", prefs.getString("base_url", DEFAULT_BASE_URL));
        apiKeyInput = field("API Key", prefs.getString("api_key", ""));
        apiKeyInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        modelIdInput = field("模型ID", prefs.getString("model_id", DEFAULT_MODEL));
        panel.addView(baseUrlInput);
        panel.addView(apiKeyInput);
        panel.addView(modelIdInput);

        Button save = compactButton("保存并收起");
        save.setOnClickListener(v -> {
            prefs.edit()
                    .putString("base_url", baseUrlInput.getText().toString().trim())
                    .putString("api_key", apiKeyInput.getText().toString().trim())
                    .putString("model_id", modelIdInput.getText().toString().trim())
                    .apply();
            settingsPanel.setVisibility(View.GONE);
            toast("API设置已保存在App私有空间");
        });
        panel.addView(save);
        return panel;
    }

    private LinearLayout buildChatPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(10), dp(8), dp(10), dp(8));
        panel.setBackground(rounded(Color.argb(166, 20, 15, 31), 18));

        messageScroll = new ScrollView(this);
        messageScroll.setFillViewport(true);
        messageScroll.setVerticalScrollBarEnabled(false);
        messageList = new LinearLayout(this);
        messageList.setOrientation(LinearLayout.VERTICAL);
        messageList.setGravity(Gravity.BOTTOM);
        messageScroll.addView(messageList, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        panel.addView(messageScroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout composer = new LinearLayout(this);
        composer.setGravity(Gravity.CENTER_VERTICAL);
        messageInput = field("输入测试对话…", "");
        messageInput.setSingleLine(false);
        messageInput.setMaxLines(3);
        composer.addView(messageInput, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        sendButton = compactButton("发送");
        sendButton.setOnClickListener(v -> sendMessage());
        composer.addView(sendButton);
        panel.addView(composer);
        return panel;
    }

    private Button compactButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(Color.WHITE);
        button.setTextSize(11);
        button.setAllCaps(false);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(dp(9), 0, dp(9), 0);
        button.setBackground(rounded(Color.argb(205, 104, 72, 148), 12));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(34));
        lp.setMarginEnd(dp(5));
        button.setLayoutParams(lp);
        return button;
    }

    private EditText field(String hint, String value) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setHintTextColor(Color.rgb(178, 164, 198));
        input.setTextColor(Color.WHITE);
        input.setTextSize(13);
        input.setText(value);
        input.setSingleLine(true);
        input.setPadding(dp(10), dp(8), dp(10), dp(8));
        input.setBackground(rounded(Color.argb(150, 62, 49, 79), 12));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(6);
        input.setLayoutParams(lp);
        return input;
    }

    private GradientDrawable rounded(int color, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        return drawable;
    }

    private void onModelZipPicked(Uri uri) {
        if (uri == null) return;
        showLoading("已选择模型，准备导入…");
        executor.execute(() -> {
            try {
                postLoading("正在清理旧模型…");
                deleteChildren(modelRoot);
                postLoading("正在解压模型 ZIP…");
                unzipSecure(uri, modelRoot);
                postLoading("正在识别模型和表情…");
                File modelFile = findFirst(modelRoot, ".model3.json");
                if (modelFile == null) throw new IOException("ZIP中没有找到 .model3.json");
                int expressionCount = registerExpressions(modelFile);
                postLoading("正在优化手机贴图，请耐心等待…");
                int optimizedTextures = optimizeModelTextures(modelFile);
                String relative = relativePath(modelRoot, modelFile);
                prefs.edit().putString("model_path", relative).apply();
                runOnUiThread(() -> {
                    hideLoading();
                    String result = "模型导入成功：发现表情 " + expressionCount
                            + " 个，优化贴图 " + optimizedTextures + " 张";
                    setStatus(result);
                    toastLong(result);
                    if (!new File(runtimeRoot, "live2dcubismcore.min.js").isFile()) {
                        addAssistantMessage(result + "。当前没有离线 Core，App 将联网加载 Live2D 官方 Core。", false);
                    }
                    loadStage();
                });
            } catch (Throwable e) {
                runOnUiThread(() -> {
                    hideLoading();
                    String error = "模型导入失败：" + readableError(e);
                    setStatus(error);
                    toastLong(error);
                    addAssistantMessage(error, false);
                });
            }
        });
    }

    private void onCorePicked(Uri uri) {
        if (uri == null) return;
        showLoading("正在导入 Cubism Core…");
        executor.execute(() -> {
            try {
                File target = new File(runtimeRoot, "live2dcubismcore.min.js");
                try (InputStream in = getContentResolver().openInputStream(uri);
                     OutputStream out = new FileOutputStream(target)) {
                    if (in == null) throw new IOException("无法读取所选文件");
                    copy(in, out);
                }
                String head;
                try (InputStream in = new FileInputStream(target)) {
                    byte[] bytes = new byte[4096];
                    int count = in.read(bytes);
                    head = count <= 0 ? "" : new String(bytes, 0, count, StandardCharsets.UTF_8);
                }
                if (!head.contains("Live2DCubismCore") && !head.contains("CubismCore")) {
                    //noinspection ResultOfMethodCallIgnored
                    target.delete();
                    throw new IOException("所选文件不像 live2dcubismcore.min.js");
                }
                runOnUiThread(() -> {
                    hideLoading();
                    setStatus("Cubism Core 已导入");
                    toastLong("Cubism Core 导入成功");
                    loadStage();
                });
            } catch (Throwable e) {
                runOnUiThread(() -> {
                    hideLoading();
                    String error = "Core导入失败：" + readableError(e);
                    setStatus(error);
                    toastLong(error);
                    addAssistantMessage(error, false);
                });
            }
        });
    }

    private void loadStage() {
        String relative = prefs.getString("model_path", "");
        String url = "https://appassets.androidplatform.net/assets/stage/index.html";
        if (!relative.trim().isEmpty() && new File(modelRoot, relative).isFile()) {
            String modelUrl = "https://appassets.androidplatform.net/model/" + encodePath(relative);
            url += "?model=" + Uri.encode(modelUrl);
        }
        webView.loadUrl(url);
    }

    private void sendMessage() {
        String text = messageInput.getText().toString().trim();
        if (text.isEmpty()) return;
        String apiKey = apiKeyInput.getText().toString().trim();
        if (apiKey.isEmpty()) {
            settingsPanel.setVisibility(View.VISIBLE);
            toast("请先填写DeepSeek API Key");
            return;
        }

        messageInput.setText("");
        addUserMessage(text);
        setSending(true);
        setStatus("DeepSeek V4 Flash · High 思考中…");

        executor.execute(() -> {
            try {
                ApiReply reply = callDeepSeek(text);
                runOnUiThread(() -> {
                    addAssistantMessage(reply.text, true);
                    applyLive2D(reply.emotion, reply.action);
                    setStatus("回复完成 · " + reply.emotion + " · " + reply.action);
                    setSending(false);
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    addAssistantMessage("请求失败：" + readableError(e), false);
                    setStatus("API请求失败");
                    setSending(false);
                });
            }
        });
    }

    private ApiReply callDeepSeek(String userText) throws Exception {
        String base = baseUrlInput.getText().toString().trim();
        String apiKey = apiKeyInput.getText().toString().trim();
        String modelId = modelIdInput.getText().toString().trim();
        if (base.isEmpty()) base = DEFAULT_BASE_URL;
        if (modelId.isEmpty()) modelId = DEFAULT_MODEL;
        String endpoint = base.endsWith("/chat/completions")
                ? base : base.replaceAll("/+$", "") + "/chat/completions";

        JSONArray messages = new JSONArray();
        messages.put(new JSONObject()
                .put("role", "system")
                .put("content", systemPrompt()));
        int start = Math.max(0, conversation.length() - 12);
        for (int i = start; i < conversation.length(); i++) messages.put(conversation.getJSONObject(i));
        messages.put(new JSONObject().put("role", "user").put("content", userText));

        JSONObject payload = new JSONObject()
                .put("model", modelId)
                .put("messages", messages)
                .put("thinking", new JSONObject().put("type", "enabled"))
                .put("reasoning_effort", "high")
                .put("max_tokens", 1200);

        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(30_000);
        connection.setReadTimeout(120_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Authorization", "Bearer " + apiKey);
        try (OutputStream out = connection.getOutputStream()) {
            out.write(payload.toString().getBytes(StandardCharsets.UTF_8));
        }

        int code = connection.getResponseCode();
        InputStream responseStream = code >= 200 && code < 300
                ? connection.getInputStream() : connection.getErrorStream();
        String body = readAll(responseStream);
        connection.disconnect();
        if (code < 200 || code >= 300) {
            throw new IOException("HTTP " + code + "：" + limit(body, 500));
        }

        JSONObject response = new JSONObject(body);
        JSONArray choices = response.optJSONArray("choices");
        if (choices == null || choices.length() == 0) throw new IOException("API没有返回choices");
        JSONObject message = choices.getJSONObject(0).getJSONObject("message");
        String content = message.optString("content", "").trim();
        if (content.isEmpty()) throw new IOException("API返回正文为空");
        ApiReply reply = parseReply(content);

        conversation.put(new JSONObject().put("role", "user").put("content", userText));
        conversation.put(new JSONObject().put("role", "assistant").put("content", reply.text));
        return reply;
    }

    private ApiReply parseReply(String raw) {
        String cleaned = raw.replaceFirst("(?s)^```(?:json)?\\s*", "")
                .replaceFirst("(?s)\\s*```$", "").trim();
        try {
            int first = cleaned.indexOf('{');
            int last = cleaned.lastIndexOf('}');
            JSONObject json = new JSONObject(first >= 0 && last > first
                    ? cleaned.substring(first, last + 1) : cleaned);
            String text = json.optString("response_text", "").trim();
            if (text.isEmpty()) text = json.optString("text", "").trim();
            if (text.isEmpty()) text = raw;
            String emotion = json.optString("emotion_tag", "neutral");
            String action = json.optString("action_tag", "none");
            if (!EMOTIONS.contains(emotion)) emotion = "neutral";
            if (!ACTIONS.contains(action)) action = "none";
            return new ApiReply(text, emotion, action);
        } catch (Exception ignored) {
            return new ApiReply(raw, "neutral", "none");
        }
    }

    private String systemPrompt() {
        return """
                你叫迷梦，是一名活泼、好奇、有点小调皮的二次元少女。你正在和一个熟悉的人进行轻松的私人聊天。
                说话自然口语化，不要客服腔，不要解释自己是AI。通常回复1到3句话。

                你的回复必须是且仅是一个JSON对象：
                {"response_text":"实际回复","emotion_tag":"情绪","action_tag":"动作"}

                emotion_tag只能选择：neutral, happy, sad, excited, shy, angry, surprised, thinking, empathy, love, confused
                action_tag只能选择：none, nod, shake_head, tilt_head, lean_forward, lean_back, sigh, pout, excited_bounce
                动作只在自然时使用，大部分普通回复选择none。不要输出代码块或JSON以外的文字。
                """;
    }

    private void applyLive2D(String emotion, String action) {
        String script = "window.live2dStage&&window.live2dStage.applyResponse("
                + JSONObject.quote(emotion) + "," + JSONObject.quote(action) + ");";
        webView.evaluateJavascript(script, null);
    }

    private void addUserMessage(String text) {
        addMessage(text, true, true);
    }

    private void addAssistantMessage(String text, boolean normalReply) {
        addMessage(text, false, normalReply);
    }

    private void addMessage(String text, boolean user, boolean normal) {
        TextView bubble = new TextView(this);
        bubble.setText(text);
        bubble.setTextColor(Color.WHITE);
        bubble.setTextSize(14);
        bubble.setPadding(dp(11), dp(8), dp(11), dp(8));
        int color = user ? Color.argb(205, 104, 72, 148)
                : normal ? Color.argb(205, 66, 53, 82) : Color.argb(205, 112, 61, 72);
        bubble.setBackground(rounded(color, 14));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = user ? Gravity.END : Gravity.START;
        lp.bottomMargin = dp(6);
        lp.leftMargin = user ? dp(48) : 0;
        lp.rightMargin = user ? 0 : dp(48);
        messageList.addView(bubble, lp);
        messageScroll.post(() -> messageScroll.fullScroll(View.FOCUS_DOWN));
    }

    private int registerExpressions(File modelFile) throws Exception {
        File modelDir = modelFile.getParentFile();
        if (modelDir == null) return 0;
        List<File> expressionFiles = new ArrayList<>();
        collectFiles(modelDir, ".exp3.json", expressionFiles);
        expressionFiles.sort(Comparator.comparing(File::getName));

        JSONObject modelJson = new JSONObject(readUtf8File(modelFile));
        JSONObject references = modelJson.optJSONObject("FileReferences");
        if (references == null) {
            references = new JSONObject();
            modelJson.put("FileReferences", references);
        }
        JSONArray expressions = new JSONArray();
        Set<String> usedNames = new HashSet<>();
        for (File file : expressionFiles) {
            String name = file.getName().replaceFirst("\\.exp3\\.json$", "");
            String unique = name;
            int suffix = 2;
            while (!usedNames.add(unique)) unique = name + "_" + suffix++;
            expressions.put(new JSONObject()
                    .put("Name", unique)
                    .put("File", relativePath(modelDir, file)));
        }
        references.put("Expressions", expressions);
        writeUtf8File(modelFile, modelJson.toString(2));
        return expressionFiles.size();
    }

    private int optimizeModelTextures(File modelFile) throws Exception {
        File modelDir = modelFile.getParentFile();
        if (modelDir == null) return 0;
        String safeRoot = modelDir.getCanonicalPath() + File.separator;
        JSONObject modelJson = new JSONObject(readUtf8File(modelFile));
        JSONObject references = modelJson.optJSONObject("FileReferences");
        JSONArray textures = references == null ? null : references.optJSONArray("Textures");
        if (textures == null) return 0;

        int optimized = 0;
        for (int i = 0; i < textures.length(); i++) {
            File texture = new File(modelDir, textures.optString(i, ""));
            if (!texture.getCanonicalPath().startsWith(safeRoot) || !texture.isFile()) continue;

            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(texture.getAbsolutePath(), bounds);
            int largest = Math.max(bounds.outWidth, bounds.outHeight);
            if (largest <= MAX_MOBILE_TEXTURE_SIZE || largest <= 0) continue;

            postLoading("正在优化贴图 " + (i + 1) + "/" + textures.length()
                    + "\n首次导入可能需要一两分钟");

            int sample = 1;
            while (largest / sample > MAX_MOBILE_TEXTURE_SIZE) sample *= 2;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sample;
            options.inPreferredConfig = Bitmap.Config.ARGB_8888;
            Bitmap bitmap = BitmapFactory.decodeFile(texture.getAbsolutePath(), options);
            if (bitmap == null) throw new IOException("无法优化贴图：" + texture.getName());

            File temporary = new File(texture.getParentFile(), texture.getName() + ".mobile.tmp");
            try (OutputStream out = new FileOutputStream(temporary)) {
                if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
                    throw new IOException("无法写入优化贴图：" + texture.getName());
                }
            } finally {
                bitmap.recycle();
            }
            try (InputStream in = new FileInputStream(temporary);
                 OutputStream out = new FileOutputStream(texture, false)) {
                copy(in, out);
            } finally {
                //noinspection ResultOfMethodCallIgnored
                temporary.delete();
            }
            optimized++;
        }
        return optimized;
    }

    private void unzipSecure(Uri uri, File destination) throws Exception {
        String destinationPath = destination.getCanonicalPath() + File.separator;
        long total = 0;
        int entries = 0;
        try (InputStream raw = getContentResolver().openInputStream(uri);
             ZipInputStream zip = new ZipInputStream(raw)) {
            if (raw == null) throw new IOException("无法读取ZIP");
            ZipEntry entry;
            byte[] buffer = new byte[64 * 1024];
            while ((entry = zip.getNextEntry()) != null) {
                if (++entries > MAX_ZIP_ENTRIES) throw new IOException("ZIP文件数量异常");
                File output = new File(destination, entry.getName());
                String outputPath = output.getCanonicalPath();
                if (!outputPath.startsWith(destinationPath)) throw new IOException("ZIP路径不安全");
                if (entry.isDirectory()) {
                    //noinspection ResultOfMethodCallIgnored
                    output.mkdirs();
                } else {
                    File parent = output.getParentFile();
                    if (parent != null) {
                        //noinspection ResultOfMethodCallIgnored
                        parent.mkdirs();
                    }
                    try (OutputStream out = new FileOutputStream(output)) {
                        int count;
                        while ((count = zip.read(buffer)) != -1) {
                            total += count;
                            if (total > MAX_EXTRACTED_BYTES) throw new IOException("解压体积超过安全限制");
                            out.write(buffer, 0, count);
                        }
                    }
                }
                zip.closeEntry();
            }
        }
    }

    private File findFirst(File root, String suffix) {
        File[] files = root.listFiles();
        if (files == null) return null;
        for (File file : files) if (file.isFile() && file.getName().endsWith(suffix)) return file;
        for (File file : files) {
            if (file.isDirectory()) {
                File found = findFirst(file, suffix);
                if (found != null) return found;
            }
        }
        return null;
    }

    private void collectFiles(File root, String suffix, List<File> output) {
        File[] files = root.listFiles();
        if (files == null) return;
        for (File file : files) {
            if (file.isDirectory()) collectFiles(file, suffix, output);
            else if (file.getName().endsWith(suffix)) output.add(file);
        }
    }

    private void deleteChildren(File root) throws IOException {
        File[] children = root.listFiles();
        if (children == null) return;
        for (File child : children) deleteRecursively(child);
    }

    private void deleteRecursively(File file) throws IOException {
        if (file.isDirectory()) deleteChildren(file);
        if (!file.delete() && file.exists()) throw new IOException("无法清理旧模型：" + file.getName());
    }

    private String relativePath(File base, File target) {
        return base.toPath().relativize(target.toPath()).toString().replace(File.separatorChar, '/');
    }

    private String encodePath(String path) {
        String[] segments = path.replace('\\', '/').split("/");
        StringBuilder result = new StringBuilder();
        for (String segment : segments) {
            if (result.length() > 0) result.append('/');
            result.append(Uri.encode(segment));
        }
        return result.toString();
    }

    private void setSending(boolean sending) {
        sendButton.setEnabled(!sending);
        sendButton.setText(sending ? "思考中…" : "发送");
    }

    private void setStatus(String text) {
        statusText.setText(text);
    }

    private void showLoading(String text) {
        loadingText.setText(text);
        loadingOverlay.setVisibility(View.VISIBLE);
        setStatus(text);
    }

    private void postLoading(String text) {
        runOnUiThread(() -> showLoading(text));
    }

    private void hideLoading() {
        loadingOverlay.setVisibility(View.GONE);
    }

    private String readAll(InputStream input) throws IOException {
        if (input == null) return "";
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            StringBuilder result = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) result.append(line).append('\n');
            return result.toString();
        }
    }

    private String readUtf8File(File file) throws IOException {
        return readAll(new FileInputStream(file));
    }

    private void writeUtf8File(File file, String text) throws IOException {
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }

    private void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int count;
        while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
    }

    private String readableError(Throwable error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? error.getClass().getSimpleName() : message;
    }

    private String limit(String text, int max) {
        if (text == null) return "";
        return text.length() <= max ? text : text.substring(0, max) + "…";
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toast(String text) {
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show();
    }

    private void toastLong(String text) {
        Toast.makeText(this, text, Toast.LENGTH_LONG).show();
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    private static final class ApiReply {
        final String text;
        final String emotion;
        final String action;

        ApiReply(String text, String emotion, String action) {
            this.text = text;
            this.emotion = emotion;
            this.action = action;
        }
    }

    private final class StageBridge {
        @JavascriptInterface
        public void onStageStatus(String status) {
            runOnUiThread(() -> setStatus(status));
        }
    }
}
