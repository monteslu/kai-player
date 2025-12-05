#!/usr/bin/env python3
"""
CREPE Runner - Pitch detection for Loukai Creator

Usage: python crepe_runner.py '{"input": "path/to/vocals.wav", "output": "path/to/pitch.json"}'

Detects pitch (F0) from vocal audio for karaoke scoring.
Outputs pitch data as JSON to stdout.
Progress updates are sent to stderr in format: PROGRESS:percent:message
"""

import json
import sys
import os

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
    output_path = args.get("output")
    hop_length = args.get("hop_length", 512)  # ~11.6ms at 44100 Hz
    model_capacity = args.get("model", "full")  # 'tiny', 'small', 'medium', 'large', 'full'

    if not input_path:
        print(json.dumps({"error": "Missing input path"}))
        sys.exit(1)

    try:
        import torch
        import torchaudio
        import torchcrepe
        import numpy as np

        # Detect device
        if torch.cuda.is_available():
            device = "cuda"
            device_name = torch.cuda.get_device_name(0)
        else:
            device = "cpu"
            device_name = "CPU"
        # Note: CREPE doesn't support MPS well, use CPU as fallback

        progress(0, f"Loading vocal audio on {device_name}")

        # Load audio
        audio, sample_rate = torchaudio.load(input_path)
        duration = audio.shape[1] / sample_rate

        progress(5, f"Loaded {duration:.1f}s of audio")

        # Convert to mono if stereo
        if audio.shape[0] > 1:
            audio = audio.mean(dim=0, keepdim=True)
            progress(8, "Converted to mono")

        # Resample to 16kHz (CREPE's expected sample rate)
        if sample_rate != 16000:
            progress(10, f"Resampling from {sample_rate}Hz to 16kHz")
            resampler = torchaudio.transforms.Resample(sample_rate, 16000)
            audio = resampler(audio)
            sample_rate = 16000

        audio = audio.to(device)

        progress(15, f"🎵 Detecting pitch ({model_capacity} model)...")

        # Run CREPE
        # Returns: time, frequency, confidence, activation
        time, frequency, confidence, _ = torchcrepe.predict(
            audio,
            sample_rate,
            hop_length=hop_length,
            model=model_capacity,
            device=device,
            return_periodicity=True,
            batch_size=2048
        )

        progress(75, "Processing pitch data")

        # Convert to numpy
        time = time.cpu().numpy().flatten()
        frequency = frequency.cpu().numpy().flatten()
        confidence = confidence.cpu().numpy().flatten()

        # Calculate stats
        valid_frames = (frequency > 0) & (confidence > 0.5)
        voiced_percent = (valid_frames.sum() / len(frequency)) * 100
        avg_confidence = confidence[valid_frames].mean() if valid_frames.any() else 0

        progress(80, f"Found pitch in {voiced_percent:.0f}% of frames")

        # Filter out low confidence predictions
        # Set frequency to 0 where confidence is low
        frequency[confidence < 0.5] = 0

        # Convert frequency to MIDI note numbers for easier use
        # MIDI = 69 + 12 * log2(f/440)
        midi = np.zeros_like(frequency)
        valid = frequency > 0
        midi[valid] = 69 + 12 * np.log2(frequency[valid] / 440.0)

        # Calculate vocal range
        if valid.any():
            min_midi = midi[valid].min()
            max_midi = midi[valid].max()
            range_semitones = max_midi - min_midi
            progress(85, f"Vocal range: {range_semitones:.0f} semitones")
        else:
            progress(85, "No pitched vocals detected")

        # Downsample for storage efficiency (keep every Nth point)
        # Original is ~86 fps, downsample to ~20 fps
        downsample_factor = 4
        time_ds = time[::downsample_factor].tolist()
        frequency_ds = frequency[::downsample_factor].tolist()
        midi_ds = midi[::downsample_factor].tolist()
        confidence_ds = confidence[::downsample_factor].tolist()

        progress(90, f"Downsampled to {len(time_ds)} points")

        # Build output
        pitch_data = {
            "time": [round(t, 4) for t in time_ds],
            "frequency": [round(f, 2) if f > 0 else 0 for f in frequency_ds],
            "midi": [round(m, 2) if m > 0 else 0 for m in midi_ds],
            "confidence": [round(c, 3) for c in confidence_ds],
            "sample_rate": sample_rate,
            "hop_length": hop_length * downsample_factor,
            "model": model_capacity
        }

        # Save to file if output path specified
        if output_path:
            progress(95, "Saving pitch data")
            with open(output_path, 'w') as f:
                json.dump(pitch_data, f)

        progress(100, f"✓ Pitch detection complete ({len(time_ds)} points)")

        # Output result
        result = {
            "success": True,
            "num_frames": len(time_ds),
            "duration": float(time[-1]) if len(time) > 0 else 0,
            "device": device,
            "voiced_percent": round(voiced_percent, 1),
            "avg_confidence": round(float(avg_confidence), 3),
            "pitch_data": pitch_data if not output_path else None,
            "output_file": output_path
        }
        print(json.dumps(result))

    except Exception as e:
        import traceback
        print(json.dumps({
            "error": str(e),
            "traceback": traceback.format_exc()
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
