package com.catkiss.live2daitest;

import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
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
import java.util.LinkedHashSet;
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
    private static final int PERFORMANCE_TEXTURE_SIZE = 1_024;
    private static final String TEXTURE_MODE_QUALITY = "quality";
    private static final String TEXTURE_MODE_PERFORMANCE = "performance";
    private static final String PROFILE_SEN = "sen-customizable-2k";

    private static final Set<String> EMOTIONS = new HashSet<>(Arrays.asList(
            "neutral", "happy", "sad", "excited", "shy", "angry",
            "surprised", "thinking", "empathy", "love", "confused"
    ));
    private static final Set<String> ACTIONS = new HashSet<>(Arrays.asList(
            "none", "nod", "shake_head", "tilt_head", "lean_forward",
            "lean_back", "blink_surprised", "sigh", "pout", "excited_bounce",
            "look_around", "soft_sway", "look_down_up", "small_nod",
            "head_tilt_idle", "side_look", "weight_shift", "gentle_lean",
            "sigh_sink", "slow_blink", "wind_sway_soft",
            "agree", "disagree", "curious", "approach", "withdraw",
            "surprised_react", "sigh_react", "pout_react", "celebrate", "calm_react"
    ));
    private static final String[][] ACTION_TESTS = {
            {"点头", "nod"}, {"摇头", "shake_head"}, {"歪头", "tilt_head"},
            {"身体前倾", "lean_forward"}, {"身体后仰", "lean_back"},
            {"惊讶一跳", "blink_surprised"}, {"叹气", "sigh"}, {"撅嘴", "pout"},
            {"开心蹦跶", "excited_bounce"}, {"倾听姿态", "listening"},
            {"环顾四周", "look_around"}, {"轻轻摇摆", "soft_sway"},
            {"低头再抬起", "look_down_up"}, {"轻点头", "small_nod"},
            {"自然歪头", "head_tilt_idle"}, {"侧目观察", "side_look"},
            {"重心移动", "weight_shift"}, {"轻靠近", "gentle_lean"},
            {"叹气下沉", "sigh_sink"}, {"慢眨眼", "slow_blink"},
            {"柔风摆动", "wind_sway_soft"}, {"明显风摆", "wind_sway_medium"},
            {"展示级大摆", "wind_sway_showcase"}, {"视频式环绕", "showcase_orbit"},
            {"摸头常规", "head_pat"}, {"摸头疑惑彩蛋", "head_pat_confused"}
    };
    private static final String[][] EMOTION_TESTS = {
            {"正常", "neutral"}, {"开心", "happy"}, {"难过", "sad"},
            {"兴奋", "excited"}, {"害羞", "shy"}, {"生气", "angry"},
            {"惊讶", "surprised"}, {"思考", "thinking"}, {"共情", "empathy"},
            {"喜欢", "love"}, {"疑惑", "confused"}
    };

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
    private Button adjustButton;
    private Button chatButton;
    private TextView statusText;
    private LinearLayout chatPanel;
    private LinearLayout testPanel;
    private LinearLayout testPanelContent;
    private FrameLayout loadingOverlay;
    private TextView loadingText;
    private boolean modelAdjustmentEnabled;
    private boolean autonomousIdleEnabled = true;
    private String touchFollowLevel;
    private String textureMode;
    private long stageLoadStartedAt;
    private final List<String> expressionPresets = new ArrayList<>();
    private final List<MotionPreset> motionPresets = new ArrayList<>();
    private final Set<String> activeAppearancePresets = new LinkedHashSet<>();

    private final ActivityResultLauncher<String[]> modelZipPicker = registerForActivityResult(
            new ActivityResultContracts.OpenDocument(), this::onModelZipPicked);
    private final ActivityResultLauncher<String[]> corePicker = registerForActivityResult(
            new ActivityResultContracts.OpenDocument(), this::onCorePicked);

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        touchFollowLevel = prefs.getString("touch_follow_level", "vivid");
        textureMode = prefs.getString("texture_mode", TEXTURE_MODE_PERFORMANCE);
        modelRoot = new File(getFilesDir(), "live2d-model");
        runtimeRoot = new File(getFilesDir(), "cubism-runtime");
        //noinspection ResultOfMethodCallIgnored
        modelRoot.mkdirs();
        //noinspection ResultOfMethodCallIgnored
        runtimeRoot.mkdirs();

        restoreDetectedPresets();
        restoreActiveAppearancePresets();
        buildUi();
        configureWebView();
        loadStage();
        addAssistantMessage("v0.4.0 测试版：下方固定面板可测试程序动作、Sen 原生预设和按键动作；顶部“对话”可按需打开 API 聊天。", false);
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

        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        root.addView(page, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(8), dp(4), dp(8), dp(4));
        toolbar.setBackgroundColor(Color.rgb(31, 24, 44));

        Button modelButton = compactButton("导入ZIP");
        modelButton.setOnClickListener(v -> modelZipPicker.launch(
                new String[]{"application/zip", "application/octet-stream"}));
        toolbar.addView(modelButton);

        Button settingsButton = compactButton("API设置");
        settingsButton.setOnClickListener(v -> settingsPanel.setVisibility(
                settingsPanel.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));
        toolbar.addView(settingsButton);

        adjustButton = compactButton("调整模型");
        adjustButton.setOnClickListener(v -> toggleModelAdjustment());
        adjustButton.setOnLongClickListener(v -> {
            evaluateStage("window.live2dStage&&window.live2dStage.resetTransform();");
            setStatus("模型位置和大小已恢复默认");
            toast("已恢复默认位置和大小");
            return true;
        });
        adjustButton.setTooltipText("点击调整；长按恢复默认");
        toolbar.addView(adjustButton);

        chatButton = compactButton("对话");
        chatButton.setOnClickListener(v -> toggleChatPanel());
        toolbar.addView(chatButton);

        statusText = new TextView(this);
        statusText.setTextColor(Color.rgb(230, 218, 250));
        statusText.setTextSize(10);
        statusText.setSingleLine(true);
        statusText.setText("v0.4.0 · 等待导入");
        LinearLayout.LayoutParams statusLp = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        statusLp.setMarginStart(dp(5));
        toolbar.addView(statusText, statusLp);
        page.addView(toolbar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(44)));

        FrameLayout stageFrame = new FrameLayout(this);
        webView = new WebView(this);
        stageFrame.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        settingsPanel = buildSettingsPanel();
        settingsPanel.setVisibility(View.GONE);
        FrameLayout.LayoutParams settingsLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP);
        settingsLp.leftMargin = dp(8);
        settingsLp.rightMargin = dp(8);
        stageFrame.addView(settingsPanel, settingsLp);

        chatPanel = buildChatPanel();
        chatPanel.setVisibility(View.GONE);
        FrameLayout.LayoutParams chatLp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(190), Gravity.BOTTOM);
        chatLp.leftMargin = dp(8);
        chatLp.rightMargin = dp(8);
        chatLp.bottomMargin = dp(8);
        stageFrame.addView(chatPanel, chatLp);

        page.addView(stageFrame, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 2f));

        testPanel = buildTestPanel();
        page.addView(testPanel, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        loadingOverlay = buildLoadingOverlay();
        root.addView(loadingOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);
    }

    private void toggleChatPanel() {
        hideKeyboard();
        boolean show = chatPanel.getVisibility() != View.VISIBLE;
        chatPanel.setVisibility(show ? View.VISIBLE : View.GONE);
        chatButton.setText(show ? "关闭对话" : "对话");
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

        Button coreButton = compactButton("导入离线Core（可选）");
        coreButton.setOnClickListener(v -> corePicker.launch(
                new String[]{"application/javascript", "text/javascript", "*/*"}));
        panel.addView(coreButton);

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

    private LinearLayout buildTestPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(8), dp(6), dp(8), dp(6));
        panel.setBackgroundColor(Color.rgb(32, 25, 45));
        panel.setVisibility(View.VISIBLE);
        panel.setClickable(true);

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(this);
        title.setText("Live2D 固定测试面板");
        title.setTextColor(Color.WHITE);
        title.setTextSize(14);
        header.addView(title, new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        panel.addView(header);

        TextView hint = new TextView(this);
        hint.setText("上方约 2/3 专用于预览；本面板固定显示。Sen 的 Watermark/press 不作为普通预设开放。");
        hint.setTextColor(Color.rgb(207, 194, 224));
        hint.setTextSize(10);
        hint.setPadding(0, dp(2), 0, dp(3));
        panel.addView(hint);

        ScrollView scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(false);
        testPanelContent = new LinearLayout(this);
        testPanelContent.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(testPanelContent, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        panel.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        rebuildTestPanel();
        return panel;
    }

    private void rebuildTestPanel() {
        if (testPanelContent == null) return;
        testPanelContent.removeAllViews();

        List<PanelItem> controls = new ArrayList<>();
        controls.add(new PanelItem("恢复正常", () -> {
            activeAppearancePresets.clear();
            saveActiveAppearancePresets();
            evaluateStage("window.live2dStage&&window.live2dStage.resetPerformance();");
            setStatus("已恢复正常表情和姿态");
            rebuildTestPanel();
        }));
        controls.add(new PanelItem(autonomousIdleEnabled ? "暂停自主待机" : "开启自主待机", () -> {
            autonomousIdleEnabled = !autonomousIdleEnabled;
            evaluateStage("window.live2dStage&&window.live2dStage.setAutonomousIdle("
                    + autonomousIdleEnabled + ");");
            setStatus(autonomousIdleEnabled ? "自主待机已开启" : "自主待机已暂停");
            rebuildTestPanel();
        }));
        controls.add(new PanelItem("跟随：" + touchFollowLabel(), () -> {
            touchFollowLevel = nextTouchFollowLevel(touchFollowLevel);
            prefs.edit().putString("touch_follow_level", touchFollowLevel).apply();
            evaluateStage("window.live2dStage&&window.live2dStage.setTouchFollowLevel("
                    + JSONObject.quote(touchFollowLevel) + ");");
            setStatus("触屏跟随力度：" + touchFollowLabel());
            rebuildTestPanel();
        }));
        controls.add(new PanelItem(textureModeLabel(), this::toggleTextureMode));
        controls.add(new PanelItem("校准摸头区域", () -> {
            evaluateStage("window.live2dStage&&window.live2dStage.beginHeadZoneCalibration();");
            toastLong("依次点击头顶区域左上角和右下角；可以框成较薄的长方形");
        }));
        controls.add(new PanelItem("重置摸头区域", () -> {
            evaluateStage("window.live2dStage&&window.live2dStage.resetHeadZone();");
            setStatus("摸头区域已恢复迷梦默认值");
        }));
        addPanelSection("控制", controls);

        List<PanelItem> actions = new ArrayList<>();
        for (String[] item : ACTION_TESTS) {
            String label = item[0];
            String action = item[1];
            actions.add(new PanelItem(label, () -> {
                evaluateStage("window.live2dStage&&window.live2dStage.testAction("
                        + JSONObject.quote(action) + ");");
                setStatus("测试动作：" + label);
            }));
        }
        addPanelSection("移植参数动作（" + actions.size() + "）", actions);

        List<PanelItem> emotions = new ArrayList<>();
        for (String[] item : EMOTION_TESTS) {
            String label = item[0];
            String emotion = item[1];
            emotions.add(new PanelItem(label, () -> {
                evaluateStage("window.live2dStage&&window.live2dStage.testEmotion("
                        + JSONObject.quote(emotion) + ");");
                setStatus("测试情绪：" + label);
            }));
        }
        addPanelSection("情绪过渡（" + emotions.size() + "）", emotions);

        if (motionPresets.isEmpty()) {
            addPanelNote("模型动作文件", "这个 ZIP 没有 .motion3.json，因此没有作者制作的成套动画；下方参数动作仍可正常运行。");
        } else {
            List<PanelItem> supportMotions = new ArrayList<>();
            List<PanelItem> keyboardMotions = new ArrayList<>();
            List<PanelItem> otherMotions = new ArrayList<>();
            for (MotionPreset preset : motionPresets) {
                PanelItem button = new PanelItem(
                        "daiji".equalsIgnoreCase(preset.label) ? "特效支撑循环" : preset.label,
                        () -> {
                    evaluateStage("window.live2dStage&&window.live2dStage.testMotion("
                            + JSONObject.quote(preset.group) + "," + preset.index + ");");
                    setStatus("测试模型动作：" + preset.label);
                });
                if ("daiji".equalsIgnoreCase(preset.label)) supportMotions.add(button);
                else if (isSenProfile()) keyboardMotions.add(button);
                else otherMotions.add(button);
            }
            if (!supportMotions.isEmpty()) addPanelSection("Sen 特效支撑动作", supportMotions);
            if (!keyboardMotions.isEmpty()) addPanelSection(
                    "Sen 原生键盘动作（" + keyboardMotions.size() + "）", keyboardMotions);
            if (!otherMotions.isEmpty()) addPanelSection(
                    "模型自带动作（" + otherMotions.size() + "）", otherMotions);
        }

        List<PanelItem> facePresets = new ArrayList<>();
        List<PanelItem> appearancePresets = new ArrayList<>();
        for (String preset : expressionPresets) {
            if (isSystemPreset(preset)) continue;
            if (looksLikeFacePreset(preset)) {
                facePresets.add(new PanelItem(preset, () -> {
                    evaluateStage("window.live2dStage&&window.live2dStage.testExpression("
                            + JSONObject.quote(preset) + ");");
                    setStatus("测试ZIP表情：" + preset);
                }));
            } else {
                boolean active = activeAppearancePresets.contains(preset);
                appearancePresets.add(new PanelItem((active ? "✓ " : "○ ") + preset, () -> {
                    boolean enable = !activeAppearancePresets.contains(preset);
                    if (enable) activeAppearancePresets.add(preset);
                    else activeAppearancePresets.remove(preset);
                    saveActiveAppearancePresets();
                    evaluateStage("window.live2dStage&&window.live2dStage.setAppearancePreset("
                            + JSONObject.quote(preset) + "," + enable + ");");
                    setStatus("外观／部件：" + preset + (enable ? " 已开启" : " 已关闭"));
                    rebuildTestPanel();
                }));
            }
        }
        if (!facePresets.isEmpty()) {
            addPanelSection("ZIP表情预设（" + facePresets.size() + "）", facePresets);
        }
        if (!appearancePresets.isEmpty()) {
            List<PanelItem> appearanceControls = new ArrayList<>();
            appearanceControls.add(new PanelItem("全部还原（当前 "
                    + activeAppearancePresets.size() + " 项开启）", () -> {
                activeAppearancePresets.clear();
                saveActiveAppearancePresets();
                evaluateStage("window.live2dStage&&window.live2dStage.clearAppearancePresets();");
                setStatus("ZIP外观／部件已全部还原");
                rebuildTestPanel();
            }));
            appearanceControls.addAll(appearancePresets);
            addPanelSection("ZIP外观／部件开关（" + appearancePresets.size()
                    + "，可叠加）", appearanceControls);
        }
        if (expressionPresets.isEmpty()) {
            addPanelNote("ZIP预设", "尚未导入模型，或模型中没有 .exp3.json 预设。");
        }

        String diagnostics = prefs.getString("model_diagnostics", "").trim();
        if (!diagnostics.isEmpty()) addPanelNote("模型诊断", diagnostics);
    }

    private String textureModeLabel() {
        return TEXTURE_MODE_QUALITY.equals(textureMode) ? "画质：2K高清" : "画质：1K流畅";
    }

    private void toggleTextureMode() {
        String next = TEXTURE_MODE_QUALITY.equals(textureMode)
                ? TEXTURE_MODE_PERFORMANCE : TEXTURE_MODE_QUALITY;
        String key = TEXTURE_MODE_QUALITY.equals(next)
                ? "original_model_path" : "performance_model_path";
        String path = prefs.getString(key, "");
        if (path.trim().isEmpty() || !new File(modelRoot, path).isFile()) {
            toastLong("当前模型没有可切换的贴图版本，请重新导入 ZIP");
            return;
        }
        textureMode = next;
        prefs.edit().putString("texture_mode", textureMode).apply();
        rebuildTestPanel();
        setStatus("正在切换到" + textureModeLabel().replace("画质：", ""));
        loadStage();
    }

    private String touchFollowLabel() {
        if ("standard".equals(touchFollowLevel)) return "标准";
        if ("extreme".equals(touchFollowLevel)) return "极限";
        return "明显";
    }

    private String nextTouchFollowLevel(String current) {
        if ("standard".equals(current)) return "vivid";
        if ("vivid".equals(current)) return "extreme";
        return "standard";
    }

    private void addPanelSection(String title, List<PanelItem> items) {
        TextView heading = new TextView(this);
        heading.setText(title);
        heading.setTextColor(Color.rgb(238, 207, 255));
        heading.setTextSize(13);
        heading.setPadding(dp(2), dp(9), 0, dp(4));
        testPanelContent.addView(heading);

        for (int start = 0; start < items.size(); start += 3) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            for (int column = 0; column < 3; column++) {
                int index = start + column;
                if (index < items.size()) {
                    PanelItem item = items.get(index);
                    Button button = panelButton(item.label);
                    button.setOnClickListener(v -> item.action.run());
                    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, dp(38), 1f);
                    lp.setMargins(dp(2), dp(2), dp(2), dp(2));
                    row.addView(button, lp);
                } else {
                    View spacer = new View(this);
                    row.addView(spacer, new LinearLayout.LayoutParams(0, dp(38), 1f));
                }
            }
            testPanelContent.addView(row);
        }
    }

    private void addPanelNote(String title, String text) {
        TextView note = new TextView(this);
        note.setText(title + "\n" + text);
        note.setTextColor(Color.rgb(205, 193, 220));
        note.setTextSize(12);
        note.setPadding(dp(4), dp(9), dp(4), dp(7));
        note.setBackground(rounded(Color.argb(38, 70, 54, 86), 10));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(dp(2), dp(4), dp(2), dp(4));
        testPanelContent.addView(note, lp);
    }

    private Button panelButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextColor(Color.WHITE);
        button.setTextSize(11);
        button.setAllCaps(false);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(dp(5), 0, dp(5), 0);
        button.setBackground(rounded(Color.rgb(74, 57, 96), 9));
        return button;
    }

    private boolean looksLikeFacePreset(String name) {
        String lower = name.toLowerCase(java.util.Locale.ROOT);
        String[] keywords = {"脸", "眼", "哭", "笑", "怒", "害羞", "发呆", "黑脸", "红晕", "嘴",
                "blush", "dizzy", "heart eye", "shocked", "starry", "sulking", "teary", "weepy"};
        for (String keyword : keywords) if (lower.contains(keyword)) return true;
        return false;
    }

    private boolean isSystemPreset(String name) {
        return "watermark".equalsIgnoreCase(name) || "press".equalsIgnoreCase(name);
    }

    private boolean isSenProfile() {
        return PROFILE_SEN.equals(prefs.getString("model_profile", "generic"));
    }

    private void saveActiveAppearancePresets() {
        JSONArray values = new JSONArray();
        for (String name : activeAppearancePresets) values.put(name);
        prefs.edit().putString("active_appearance_presets", values.toString()).apply();
    }

    private void restoreActiveAppearancePresets() {
        activeAppearancePresets.clear();
        try {
            JSONArray values = new JSONArray(
                    prefs.getString("active_appearance_presets", "[]"));
            for (int i = 0; i < values.length(); i++) {
                String name = values.optString(i, "").trim();
                if (!name.isEmpty() && expressionPresets.contains(name)
                        && !looksLikeFacePreset(name)) {
                    activeAppearancePresets.add(name);
                }
            }
        } catch (Exception ignored) {
            activeAppearancePresets.clear();
        }
    }

    private String activeAppearancePresetsJson() {
        JSONArray values = new JSONArray();
        for (String name : activeAppearancePresets) values.put(name);
        return values.toString();
    }

    private void evaluateStage(String script) {
        webView.evaluateJavascript(script, null);
    }

    private void hideKeyboard() {
        if (messageInput != null) messageInput.clearFocus();
        InputMethodManager manager = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (manager != null && webView != null) {
            manager.hideSoftInputFromWindow(webView.getWindowToken(), 0);
        }
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
                List<String> detectedExpressions = registerExpressions(modelFile);
                List<MotionPreset> detectedMotions = registerMotions(modelFile);
                postLoading("正在分析模型并生成 1K 流畅贴图…\nSen 首次导入可能需要几分钟");
                String profile = detectModelProfile(modelFile);
                TexturePreparation textures = prepareTextureVariants(
                        modelFile, detectedExpressions.size(), detectedMotions.size(), profile);
                saveDetectedPresets(textures.originalPath, textures.performancePath, profile,
                        textures.diagnostics, detectedExpressions, detectedMotions);
                runOnUiThread(() -> {
                    expressionPresets.clear();
                    expressionPresets.addAll(detectedExpressions);
                    motionPresets.clear();
                    motionPresets.addAll(detectedMotions);
                    activeAppearancePresets.clear();
                    saveActiveAppearancePresets();
                    rebuildTestPanel();
                    hideLoading();
                    String result = "模型导入成功：发现预设 " + detectedExpressions.size()
                            + " 个、动作文件 " + detectedMotions.size()
                            + " 个；已准备 2K/1K 两档（当前 "
                            + (TEXTURE_MODE_QUALITY.equals(textureMode) ? "2K" : "1K") + "）";
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
        modelAdjustmentEnabled = false;
        autonomousIdleEnabled = true;
        if (adjustButton != null) {
            adjustButton.setText("调整模型");
            adjustButton.setBackground(rounded(Color.argb(205, 104, 72, 148), 12));
        }
        String preferredKey = TEXTURE_MODE_QUALITY.equals(textureMode)
                ? "original_model_path" : "performance_model_path";
        String relative = prefs.getString(preferredKey, prefs.getString("model_path", ""));
        if (!relative.trim().isEmpty() && !new File(modelRoot, relative).isFile()) {
            relative = prefs.getString("model_path", "");
        }
        String url = "https://appassets.androidplatform.net/assets/stage/index.html";
        if (!relative.trim().isEmpty() && new File(modelRoot, relative).isFile()) {
            String modelUrl = "https://appassets.androidplatform.net/model/" + encodePath(relative);
            String profile = prefs.getString("model_profile", "generic");
            url += "?model=" + Uri.encode(modelUrl)
                    + "&profile=" + Uri.encode(profile)
                    + "&textureMode=" + Uri.encode(textureMode);
        }
        stageLoadStartedAt = SystemClock.elapsedRealtime();
        webView.loadUrl(url);
    }

    private void startNativeSupportLoop() {
        for (MotionPreset preset : motionPresets) {
            if ("daiji".equalsIgnoreCase(preset.label)) {
                evaluateStage("window.live2dStage&&window.live2dStage.startSupportLoop("
                        + JSONObject.quote(preset.group) + "," + preset.index + ");");
                return;
            }
        }
    }

    private void toggleModelAdjustment() {
        hideKeyboard();
        modelAdjustmentEnabled = !modelAdjustmentEnabled;
        adjustButton.setText(modelAdjustmentEnabled ? "完成调整" : "调整模型");
        adjustButton.setBackground(rounded(
                modelAdjustmentEnabled ? Color.argb(235, 174, 93, 155)
                        : Color.argb(205, 104, 72, 148), 12));
        String script = "window.live2dStage&&window.live2dStage.setAdjustMode("
                + modelAdjustmentEnabled + ");";
        webView.evaluateJavascript(script, null);
        if (modelAdjustmentEnabled) {
            setStatus("调整模式：单指拖动，双指缩放");
            toastLong("单指拖动模型，双指缩放；完成后再点一次按钮");
        } else {
            setStatus("模型位置和大小已保存");
            toast("模型调整已保存");
        }
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
        evaluateStage("window.live2dStage&&window.live2dStage.setFocusedInteraction(true);");

        executor.execute(() -> {
            try {
                ApiReply reply = callDeepSeek(text);
                runOnUiThread(() -> {
                    addAssistantMessage(reply.text, true);
                    applyLive2D(reply.emotion, reply.action);
                    evaluateStage("window.live2dStage&&window.live2dStage.setFocusedInteraction(false);");
                    setStatus("回复完成 · " + reply.emotion + " · " + reply.action);
                    setSending(false);
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    evaluateStage("window.live2dStage&&window.live2dStage.setFocusedInteraction(false);");
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
                action_tag只表达动作意图，程序会自行选择具体动作：
                none=不指定；agree=赞同确认；disagree=拒绝不同意；curious=好奇疑惑；approach=感兴趣靠近；withdraw=吃惊或不舒服而退开；surprised_react=明显惊讶；sigh_react=叹气疲惫；pout_react=委屈不满；celebrate=开心庆祝；calm_react=温和安静回应。
                action_tag只能选择：none, agree, disagree, curious, approach, withdraw, surprised_react, sigh_react, pout_react, celebrate, calm_react
                普通回复可以选择none；程序会结合emotion_tag补充低频自然动作。不要输出代码块或JSON以外的文字。
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

    private List<String> registerExpressions(File modelFile) throws Exception {
        File modelDir = modelFile.getParentFile();
        if (modelDir == null) return new ArrayList<>();
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
        List<String> names = new ArrayList<>();
        for (File file : expressionFiles) {
            String name = file.getName().replaceFirst("\\.exp3\\.json$", "");
            String unique = name;
            int suffix = 2;
            while (!usedNames.add(unique)) unique = name + "_" + suffix++;
            expressions.put(new JSONObject()
                    .put("Name", unique)
                    .put("File", relativePath(modelDir, file)));
            names.add(unique);
        }
        references.put("Expressions", expressions);
        writeUtf8File(modelFile, modelJson.toString(2));
        return names;
    }

    private List<MotionPreset> registerMotions(File modelFile) throws Exception {
        File modelDir = modelFile.getParentFile();
        if (modelDir == null) return new ArrayList<>();
        JSONObject modelJson = new JSONObject(readUtf8File(modelFile));
        JSONObject references = modelJson.optJSONObject("FileReferences");
        if (references == null) {
            references = new JSONObject();
            modelJson.put("FileReferences", references);
        }
        JSONObject motions = references.optJSONObject("Motions");
        if (motions == null) {
            motions = new JSONObject();
            references.put("Motions", motions);
        }

        Set<String> registeredFiles = new HashSet<>();
        java.util.Iterator<String> existingGroups = motions.keys();
        while (existingGroups.hasNext()) {
            JSONArray group = motions.optJSONArray(existingGroups.next());
            if (group == null) continue;
            for (int i = 0; i < group.length(); i++) {
                String file = group.optJSONObject(i) == null ? ""
                        : group.optJSONObject(i).optString("File", "");
                if (!file.isEmpty()) registeredFiles.add(file.replace('\\', '/'));
            }
        }

        List<File> motionFiles = new ArrayList<>();
        collectFiles(modelDir, ".motion3.json", motionFiles);
        motionFiles.sort(Comparator.comparing(File::getName));
        JSONArray automatic = motions.optJSONArray("AutoDetected");
        if (automatic == null) automatic = new JSONArray();
        for (File file : motionFiles) {
            String relative = relativePath(modelDir, file);
            if (registeredFiles.add(relative)) {
                automatic.put(new JSONObject().put("File", relative));
            }
        }
        if (automatic.length() > 0) motions.put("AutoDetected", automatic);
        writeUtf8File(modelFile, modelJson.toString(2));

        List<String> groupNames = new ArrayList<>();
        java.util.Iterator<String> groups = motions.keys();
        while (groups.hasNext()) groupNames.add(groups.next());
        groupNames.sort(String::compareToIgnoreCase);
        List<MotionPreset> presets = new ArrayList<>();
        for (String groupName : groupNames) {
            JSONArray group = motions.optJSONArray(groupName);
            if (group == null) continue;
            for (int i = 0; i < group.length(); i++) {
                JSONObject entry = group.optJSONObject(i);
                String file = entry == null ? "" : entry.optString("File", "");
                String label = file.replace('\\', '/');
                int slash = label.lastIndexOf('/');
                if (slash >= 0) label = label.substring(slash + 1);
                label = label.replaceFirst("\\.motion3\\.json$", "");
                if (label.isEmpty()) label = groupName + " " + (i + 1);
                presets.add(new MotionPreset(groupName, i, label));
            }
        }
        return presets;
    }

    private void saveDetectedPresets(String originalPath, String performancePath,
                                     String profile, String diagnostics,
                                     List<String> expressions,
                                     List<MotionPreset> motions) throws Exception {
        JSONArray expressionJson = new JSONArray();
        for (String expression : expressions) expressionJson.put(expression);
        JSONArray motionJson = new JSONArray();
        for (MotionPreset motion : motions) {
            motionJson.put(new JSONObject()
                    .put("group", motion.group)
                    .put("index", motion.index)
                    .put("label", motion.label));
        }
        prefs.edit()
                .putString("model_path", originalPath)
                .putString("original_model_path", originalPath)
                .putString("performance_model_path", performancePath)
                .putString("model_profile", profile)
                .putString("model_diagnostics", diagnostics)
                .putString("detected_expressions", expressionJson.toString())
                .putString("detected_motions", motionJson.toString())
                .apply();
    }

    private void restoreDetectedPresets() {
        expressionPresets.clear();
        motionPresets.clear();
        try {
            JSONArray expressions = new JSONArray(
                    prefs.getString("detected_expressions", "[]"));
            for (int i = 0; i < expressions.length(); i++) {
                String name = expressions.optString(i, "").trim();
                if (!name.isEmpty()) expressionPresets.add(name);
            }
            JSONArray motions = new JSONArray(prefs.getString("detected_motions", "[]"));
            for (int i = 0; i < motions.length(); i++) {
                JSONObject motion = motions.optJSONObject(i);
                if (motion == null) continue;
                String group = motion.optString("group", "").trim();
                if (group.isEmpty()) continue;
                motionPresets.add(new MotionPreset(group, motion.optInt("index", 0),
                        motion.optString("label", group + " " + (i + 1))));
            }
        } catch (Exception ignored) {
            expressionPresets.clear();
            motionPresets.clear();
        }
    }

    private String detectModelProfile(File modelFile) {
        String path = modelFile.getAbsolutePath().toLowerCase(java.util.Locale.ROOT);
        if (path.contains("sen customizable model")) return PROFILE_SEN;
        return "generic";
    }

    private TexturePreparation prepareTextureVariants(File modelFile, int expressionCount,
                                                      int motionCount, String profile) throws Exception {
        File modelDir = modelFile.getParentFile();
        if (modelDir == null) throw new IOException("模型目录无效");
        String safeRoot = modelDir.getCanonicalPath() + File.separator;
        JSONObject modelJson = new JSONObject(readUtf8File(modelFile));
        JSONObject references = modelJson.optJSONObject("FileReferences");
        JSONArray textures = references == null ? null : references.optJSONArray("Textures");
        if (textures == null) throw new IOException("model3 没有贴图列表");

        JSONObject performanceJson = new JSONObject(modelJson.toString());
        JSONArray performanceTextures = performanceJson
                .getJSONObject("FileReferences").getJSONArray("Textures");
        File variantDir = new File(modelDir, "__mobile_1k");
        //noinspection ResultOfMethodCallIgnored
        variantDir.mkdirs();

        int optimized = 0;
        int maxDimension = 0;
        long sourceRgbaBytes = 0;
        long performanceRgbaBytes = 0;
        for (int i = 0; i < textures.length(); i++) {
            File texture = new File(modelDir, textures.optString(i, ""));
            if (!texture.getCanonicalPath().startsWith(safeRoot) || !texture.isFile()) {
                throw new IOException("贴图路径无效：" + textures.optString(i, ""));
            }

            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(texture.getAbsolutePath(), bounds);
            int largest = Math.max(bounds.outWidth, bounds.outHeight);
            if (largest <= 0) throw new IOException("无法读取贴图尺寸：" + texture.getName());
            maxDimension = Math.max(maxDimension, largest);
            sourceRgbaBytes += (long) bounds.outWidth * bounds.outHeight * 4L;

            if (largest <= PERFORMANCE_TEXTURE_SIZE) {
                performanceRgbaBytes += (long) bounds.outWidth * bounds.outHeight * 4L;
                continue;
            }

            postLoading("正在生成 1K 流畅贴图 " + (i + 1) + "/" + textures.length()
                    + "\n保留原始 2K，不会修改源 ZIP");

            int sample = 1;
            while (largest / sample > PERFORMANCE_TEXTURE_SIZE) sample *= 2;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sample;
            options.inPreferredConfig = Bitmap.Config.ARGB_8888;
            Bitmap bitmap = BitmapFactory.decodeFile(texture.getAbsolutePath(), options);
            if (bitmap == null) throw new IOException("无法生成流畅贴图：" + texture.getName());

            File target = new File(variantDir, String.format(java.util.Locale.ROOT,
                    "texture_%02d.png", i));
            try (OutputStream out = new FileOutputStream(target)) {
                if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) {
                    throw new IOException("无法写入流畅贴图：" + texture.getName());
                }
            } finally {
                performanceRgbaBytes += (long) bitmap.getWidth() * bitmap.getHeight() * 4L;
                bitmap.recycle();
            }
            performanceTextures.put(i, relativePath(modelDir, target));
            optimized++;
        }

        File performanceModel = modelFile;
        if (optimized > 0) {
            String generatedName = modelFile.getName().replaceFirst(
                    "\\.model3\\.json$", ".mobile1k.model3.json");
            performanceModel = new File(modelDir, generatedName);
            writeUtf8File(performanceModel, performanceJson.toString(2));
        } else {
            performanceRgbaBytes = sourceRgbaBytes;
        }

        long mocBytes = 0;
        if (references != null) {
            String mocPath = references.optString("Moc", "");
            File moc = new File(modelDir, mocPath);
            if (moc.isFile()) mocBytes = moc.length();
        }
        String profileName = PROFILE_SEN.equals(profile) ? "Sen Customizable 2K" : "通用模型";
        String diagnostics = profileName + " · moc3 " + formatMiB(mocBytes)
                + "\n贴图 " + textures.length() + " 张 · 最大 " + maxDimension + "px"
                + "\n估算 RGBA：2K " + formatMiB(sourceRgbaBytes)
                + " / 1K " + formatMiB(performanceRgbaBytes)
                + "\n预设 " + expressionCount + " · motion " + motionCount
                + " · 当前 " + (TEXTURE_MODE_QUALITY.equals(textureMode) ? "2K高清" : "1K流畅");
        return new TexturePreparation(relativePath(modelRoot, modelFile),
                relativePath(modelRoot, performanceModel), diagnostics);
    }

    private String formatMiB(long bytes) {
        return String.format(java.util.Locale.ROOT, "%.1f MiB", bytes / 1048576.0);
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

    private static final class PanelItem {
        final String label;
        final Runnable action;

        PanelItem(String label, Runnable action) {
            this.label = label;
            this.action = action;
        }
    }

    private static final class MotionPreset {
        final String group;
        final int index;
        final String label;

        MotionPreset(String group, int index, String label) {
            this.group = group;
            this.index = index;
            this.label = label;
        }
    }

    private static final class TexturePreparation {
        final String originalPath;
        final String performancePath;
        final String diagnostics;

        TexturePreparation(String originalPath, String performancePath, String diagnostics) {
            this.originalPath = originalPath;
            this.performancePath = performancePath;
            this.diagnostics = diagnostics;
        }
    }

    private final class StageBridge {
        @JavascriptInterface
        public void onStageStatus(String status) {
            runOnUiThread(() -> {
                setStatus(status);
                if ("模型已就绪".equals(status)) {
                    long loadMs = Math.max(0, SystemClock.elapsedRealtime() - stageLoadStartedAt);
                    setStatus("模型已就绪 · "
                            + (TEXTURE_MODE_QUALITY.equals(textureMode) ? "2K" : "1K")
                            + " · " + String.format(java.util.Locale.ROOT, "%.1fs", loadMs / 1000.0));
                    evaluateStage("window.live2dStage&&window.live2dStage.setTouchFollowLevel("
                            + JSONObject.quote(touchFollowLevel) + ");");
                    evaluateStage("window.live2dStage&&window.live2dStage.setAppearancePresets("
                            + activeAppearancePresetsJson() + ");");
                    startNativeSupportLoop();
                }
            });
        }

        @JavascriptInterface
        public void onStageDiagnostics(String diagnostics) {
            runOnUiThread(() -> {
                if (diagnostics == null || diagnostics.trim().isEmpty()) return;
                prefs.edit().putString("runtime_diagnostics", diagnostics).apply();
            });
        }

        @JavascriptInterface
        public void onInteraction(String interaction) {
            runOnUiThread(() -> setStatus(interaction));
        }
    }
}
