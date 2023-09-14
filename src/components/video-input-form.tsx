import { FileVideo, Upload } from "lucide-react";
import { Separator } from "./ui/separator";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { ChangeEvent, FormEvent, useState, useMemo, useRef } from "react";
import { getFFmpeg } from "@/lib/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { api } from "@/lib/axios";

type Status = "waiting" | "uploading" | "generating" | "success" | number;

interface VideoInputFormProps {
  onVideoUploaded: (videoId: string) => void;
}

const getStatusMessage = (status: Status): string => {
  if (typeof status === "string") {
    const statusMessages = {
      generating: "Transcrevendo...",
      uploading: "Enviando...",
      success: "Sucesso!",
      waiting: "Carregar vídeo",
    };
    if (statusMessages[status]) return statusMessages[status];
  }

  return `Convertendo ${status}%`;
};

export function VideoInputForm(props: VideoInputFormProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("waiting");

  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const { files } = event.currentTarget;

    if (!files) return;

    const [selectedFile] = files;

    setVideoFile(selectedFile);
  }

  async function convertVideoToAudio(video: File) {
    const ffmpeg = await getFFmpeg();

    await ffmpeg.writeFile("input.mp4", await fetchFile(video));

    // ffmpeg.on("log", (log) => {
    //   console.log(log);
    // });

    ffmpeg.on("progress", (progress) => {
      setStatus(Math.round(progress.progress * 100));
    });

    await ffmpeg.exec([
      "-i",
      "input.mp4",
      "-map",
      "0:a",
      "-b:a",
      "20K",
      "-acodec",
      "libmp3lame",
      "output.mp3",
    ]);

    const data = await ffmpeg.readFile("output.mp3");

    const audioFileBlob = new Blob([data], { type: "audio/mpeg" });
    const audioFile = new File([audioFileBlob], "audio.mp3", {
      type: "audio/mpeg",
    });

    return audioFile;
  }

  async function handleUploadVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = promptInputRef.current?.value;
    if (!(prompt && videoFile)) return;

    setStatus(0);
    const audioFile = await convertVideoToAudio(videoFile);

    const data = new FormData();

    data.append("file", audioFile);

    setStatus("uploading");
    const response = await api.post("/videos", data);

    const videoId = response.data.video.id;

    setStatus("generating");
    await api.post(`/videos/${videoId}/transcription`, {
      prompt,
    });

    setStatus("success");
    props.onVideoUploaded(videoId);
  }

  const previewURL = useMemo(() => {
    if (!videoFile) return null;

    return URL.createObjectURL(videoFile);
  }, [videoFile]);

  return (
    <form onSubmit={handleUploadVideo} className="space-y-6">
      <label
        htmlFor="video"
        className="relative border flex rounded-md aspect-video cursor-pointer border-dashed text-sm flex-col gap-2 items-center justify-center text-muted-foreground hover:bg-primary/5"
      >
        {previewURL ? (
          <video
            src={previewURL}
            controls={false}
            className="pointer-events-none absolute inset-0 aspect-video"
          />
        ) : (
          <>
            <FileVideo className="w-4 h-4" />
            Selecione um vídeo
          </>
        )}
      </label>

      <input
        type="file"
        id="video"
        accept="video/mp4"
        className="sr-only"
        onChange={handleFileSelected}
      />

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="transcription_prompt">Prompt de transcrição</Label>
        <Textarea
          disabled={status !== "waiting"}
          ref={promptInputRef}
          id="transcription_prompt"
          className="h-20 leading-relaxed resize-none"
          placeholder="Inclua palavras-chave mencionadas no vídeo separadas por vírgula."
        ></Textarea>
      </div>

      <Button
        data-success={status === "success"}
        disabled={status !== "waiting"}
        type="submit"
        className="w-full data-[success=true]:bg-emerald-400"
      >
        {status === "waiting" ? (
          <>
            Carregar vídeo
            <Upload className="w-4 h-4 ml-2" />
          </>
        ) : (
          getStatusMessage(status)
        )}
      </Button>
    </form>
  );
}
