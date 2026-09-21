"""Run on the VPS after resource limits are installed. No credentials or chat data."""
import json
import time
import urllib.request
from pathlib import Path


def post(path, data, timeout=100):
    req = urllib.request.Request("http://127.0.0.1:11434/api/" + path, json.dumps(data).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)


def memory():
    return {line.split(":")[0]: int(line.split()[1]) for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith(("MemAvailable:", "SwapFree:"))}


report = {"time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "before": memory(), "runs": []}
# 9B weights alone are 6.6GB: leave 3GiB headroom for production and do not force an OOM benchmark.
report["9b"] = {"status": "DEFERRED_RESOURCE_BUDGET", "weightsBytes": 6600000000, "requiredHeadroomBytes": 3221225472,
                "reason": "Weights + runtime/context + production reserve exceed available memory; swap is already full."}
for model, path, extra in [
    ("qwen3.5:4b", "chat", {"messages": [{"role": "user", "content": "Responde en español, en una frase: pregunta para qué uso necesita un cargador."}], "think": False, "stream": False, "options": {"num_ctx": 8192, "num_predict": 60, "num_thread": 2}}),
    ("qwen3-embedding:0.6b", "embed", {"input": ["arrancador de batería para carro"], "options": {"num_ctx": 8192, "num_thread": 2}}),
]:
    started = time.monotonic()
    try:
        data = post(path, {"model": model, "keep_alive": 0, **extra})
        report["runs"].append({"model": model, "seconds": time.monotonic() - started, "tokens": data.get("eval_count"),
            "evalDurationNs": data.get("eval_duration"), "embeddingDimensions": len(data.get("embeddings", [[]])[0]),
            "reply": data.get("message", {}).get("content"), "after": memory()})
    except Exception as error:
        report["runs"].append({"model": model, "seconds": time.monotonic() - started, "error": type(error).__name__})
    time.sleep(2)
report["after"] = memory()
Path("/var/log/rocky/benchmark.json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(json.dumps(report, indent=2, ensure_ascii=False))
