#!/usr/bin/env python3
"""
Demucs Runner - Stem separation for Loukai Creator

Usage: python demucs_runner.py '{"input": "path/to/audio.wav", "output_dir": "path/to/output", "model": "htdemucs_ft"}'

Outputs stems as WAV files and prints JSON result to stdout.
Progress updates are sent to stderr in format: PROGRESS:percent:message
tqdm progress bars are also output to stderr and parsed by Node.js
"""

import json
import sys
from pathlib import Path

def progress(percent, message):
    """Send progress update to stderr"""
    print(f"PROGRESS:{percent}:{message}", file=sys.stderr, flush=True)

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing arguments"}))
        sys.exit(1)

    try:
        args = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON arguments: {e}"}))
        sys.exit(1)

    input_path = args.get("input")
    output_dir = args.get("output_dir")
    model_name = args.get("model", "htdemucs_ft")
    num_stems = args.get("num_stems", 4)

    if not input_path or not output_dir:
        print(json.dumps({"error": "Missing input or output_dir"}))
        sys.exit(1)

    try:
        import torch
        import torchaudio
        from demucs.pretrained import get_model
        from demucs.apply import apply_model
        from demucs.audio import convert_audio

        # Detect device
        if torch.cuda.is_available():
            device = "cuda"
            device_name = torch.cuda.get_device_name(0)
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            device = "mps"
            device_name = "Apple Silicon GPU"
        else:
            device = "cpu"
            device_name = "CPU"

        progress(0, f"Loading model on {device_name}")

        # Load model
        model = get_model(model_name)
        model.to(device)
        model.eval()

        source_names = model.sources
        stem_labels = {
            'drums': '🥁 Drums',
            'bass': '🎸 Bass',
            'other': '🎹 Other',
            'vocals': '🎤 Vocals',
            'no_vocals': '🎵 Instrumental',
        }

        progress(5, "Loading audio file")

        # Load audio
        audio, sample_rate = torchaudio.load(input_path)
        duration = audio.shape[1] / sample_rate

        progress(8, f"Loaded {duration:.1f}s audio")

        # Convert to model format
        audio = convert_audio(
            audio.unsqueeze(0),
            sample_rate,
            model.samplerate,
            model.audio_channels
        ).to(device)

        stems_str = " + ".join(stem_labels.get(s, s) for s in source_names)
        progress(10, f"Separating {stems_str}")

        # Run separation with tqdm progress (parsed by Node.js)
        with torch.no_grad():
            sources = apply_model(
                model,
                audio,
                device=device,
                shifts=1,
                split=True,
                overlap=0.25,
                progress=True  # tqdm output goes to stderr
            )

        progress(82, "Separation complete!")

        # Resample if needed
        if model.samplerate != sample_rate:
            progress(83, f"Resampling to {sample_rate}Hz")
            sources = torchaudio.functional.resample(
                sources.squeeze(0),
                model.samplerate,
                sample_rate
            ).unsqueeze(0)

        # Save stems
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        stem_files = {}
        num_sources = len(source_names)

        for i, name in enumerate(source_names):
            stem_progress = int(85 + (i / num_sources) * 14)
            label = stem_labels.get(name, name.capitalize())
            progress(stem_progress, f"Saving {label}")

            stem_audio = sources[0, i].cpu()
            stem_path = output_path / f"{name}.wav"
            torchaudio.save(str(stem_path), stem_audio, sample_rate)
            stem_files[name] = str(stem_path)

        progress(100, f"✓ Saved {num_sources} stems")

        print(json.dumps({
            "success": True,
            "stems": stem_files,
            "model": model_name,
            "device": device,
            "sample_rate": sample_rate,
            "duration": duration
        }))

    except Exception as e:
        import traceback
        print(json.dumps({
            "error": str(e),
            "traceback": traceback.format_exc()
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
