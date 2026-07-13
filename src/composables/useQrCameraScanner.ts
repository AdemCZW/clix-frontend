import { ref } from "vue";
import jsQR from "jsqr";

export interface UseQrCameraScannerOptions {
  onDecode: (raw: string) => void;
  onError?: (e: Error) => void;
}

export function useQrCameraScanner(opts: UseQrCameraScannerOptions) {
  const videoElement = ref<HTMLVideoElement | null>(null);
  const isScanning = ref(false);

  let stream: MediaStream | null = null;
  let animationId: number | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let canvasCtx: CanvasRenderingContext2D | null = null;

  const tick = () => {
    if (!isScanning.value || !videoElement.value || !canvas || !canvasCtx) return;
    if (videoElement.value.readyState === videoElement.value.HAVE_ENOUGH_DATA) {
      canvas.width = videoElement.value.videoWidth;
      canvas.height = videoElement.value.videoHeight;
      canvasCtx.drawImage(videoElement.value, 0, 0, canvas.width, canvas.height);
      const imageData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
      // jsQR 偵測到反光 / 條碼 / 紋路時可能回 { data: "" }，避免誤判觸發
      if (code && code.data && code.data.trim()) {
        opts.onDecode(code.data);
        return;
      }
    }
    animationId = requestAnimationFrame(tick);
  };

  const start = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      isScanning.value = true;
      await new Promise<void>((r) => setTimeout(r, 100));
      if (videoElement.value) {
        videoElement.value.srcObject = stream;
        await new Promise<void>((r) => {
          videoElement.value!.onloadedmetadata = () => { videoElement.value!.play(); r(); };
        });
        canvas = document.createElement("canvas");
        canvasCtx = canvas.getContext("2d");
        tick();
      }
    } catch (err) {
      opts.onError?.(err as Error);
    }
  };

  const stop = () => {
    isScanning.value = false;
    if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (videoElement.value) videoElement.value.srcObject = null;
  };

  return { videoElement, isScanning, start, stop };
}
