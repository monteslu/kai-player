/**
 * WebRTC Manager - Handles canvas streaming via WebRTC
 *
 * Replaces inline executeJavaScript() code with proper module structure
 * for type safety and error handling.
 */

export class WebRTCManager {
  constructor() {
    this.senderPC = null;
    this.receiverPC = null;
    this.canvasStream = null;
    this.streamCaptureCanvas = null;
    this.streamingToChild = false;
    this.pendingICECandidates = []; // Queue for sender early ICE candidates
    this.receiverPendingICE = []; // Queue for receiver early ICE candidates
  }

  /**
   * Set up WebRTC sender in main window
   * Creates offscreen canvas and RTCPeerConnection for sending
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async setupSender() {
    try {
      console.log('🎬 Setting up WebRTC sender');

      const canvas = document.getElementById('karaokeCanvas');
      if (!canvas) {
        return { success: false, error: 'Canvas not found' };
      }

      // Get or create persistent offscreen canvas for streaming
      if (!this.streamCaptureCanvas) {
        this.streamCaptureCanvas = document.createElement('canvas');
        this.streamCaptureCanvas.width = 1920;
        this.streamCaptureCanvas.height = 1080;
        this.streamCaptureCanvas.style.display = 'none';
        document.body.appendChild(this.streamCaptureCanvas);

        // Create the MediaStream from this canvas (once)
        this.canvasStream = this.streamCaptureCanvas.captureStream(60);

        // Check if track is actually 1920x1080
        const track = this.canvasStream.getVideoTracks()[0];
        const settings = track.getSettings();
        console.log('🔍 Capture stream resolution:', settings.width, 'x', settings.height);

        if (settings.width !== 1920 || settings.height !== 1080) {
          console.error('❌ CAPTURE STREAM NOT 1080p! Actual:', settings.width, 'x', settings.height);
        }
      }

      // Start painting to the offscreen canvas now that child window is open
      const captureCtx = this.streamCaptureCanvas.getContext('2d');

      const copyFrame = () => {
        if (this.streamingToChild) {
          captureCtx.drawImage(canvas, 0, 0, 1920, 1080);
          requestAnimationFrame(copyFrame);
        }
      };
      this.streamingToChild = true;
      copyFrame();

      // Return the existing stream
      const stream = this.canvasStream;

      if (stream.getVideoTracks().length === 0) {
        return { success: false, error: 'No video track' };
      }

      // Create RTCPeerConnection with optimized settings for local streaming
      const pc = new RTCPeerConnection({
        iceServers: [], // No ICE servers needed for local connection
        iceCandidatePoolSize: 10,
        bundlePolicy: 'balanced',
        rtcpMuxPolicy: 'require',
        sdpSemantics: 'unified-plan'
      });

      // Add stream tracks with transceivers for better control
      stream.getTracks().forEach(track => {
        console.log('➕ Adding track:', track.kind);

        if (track.kind === 'video') {
          // Apply constraints to force 1920x1080
          track.applyConstraints({
            width: { exact: 1920 },
            height: { exact: 1080 },
            frameRate: { exact: 60 }
          }).then(() => {
            console.log('🎯 Applied 1920x1080 constraints to track');
          }).catch(err => {
            console.error('❌ Failed to apply constraints:', err);
          });
        }

        const transceiver = pc.addTransceiver(track, {
          direction: 'sendonly',
          streams: [stream]
        });

        // Configure for high quality, low compression
        if (track.kind === 'video') {
          const sender = transceiver.sender;

          // Set encoding parameters to maintain resolution
          const setEncodingParams = async () => {
            try {
              const params = sender.getParameters();

              // Critical: Tell WebRTC to maintain resolution over frame rate
              params.degradationPreference = 'maintain-resolution';

              if (params.encodings && params.encodings.length > 0) {
                // Force no downscaling and high bitrate
                params.encodings[0].maxBitrate = 50000000; // 50 Mbps
                params.encodings[0].maxFramerate = 60;
                params.encodings[0].scaleResolutionDownBy = 1.0; // No downscaling
                params.encodings[0].minBitrate = 10000000; // Min 10 Mbps
              }

              await sender.setParameters(params);
              console.log('🎯 Set maintain-resolution + no downscaling');
            } catch (error) {
              console.error('❌ Failed to set encoding parameters:', error);
            }
          };

          // Apply immediately
          setEncodingParams();

          // Apply again after connection to ensure it sticks
          setTimeout(setEncodingParams, 2000);
          setTimeout(setEncodingParams, 5000);
        }
      });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Sender ICE candidate');
          window.kaiAPI.canvas.sendICECandidate('sender', {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          });
        }
      };

      // Store references
      this.senderPC = pc;

      console.log('✅ Sender setup complete');
      return { success: true };
    } catch (error) {
      console.error('❌ Sender error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create WebRTC offer in sender
   * @returns {Promise<{type: string, sdp: string} | {error: string}>}
   */
  async createOffer() {
    try {
      console.log('📋 Creating offer...');

      // Force CPU-efficient codec for 1080p streaming
      const transceivers = this.senderPC.getTransceivers();
      transceivers.forEach(transceiver => {
        if (transceiver.sender && transceiver.sender.track && transceiver.sender.track.kind === 'video') {
          const capabilities = RTCRtpSender.getCapabilities('video');
          console.log('📺 Available video codecs:', capabilities.codecs.map(c => c.mimeType));

          // Prioritize codecs for CPU efficiency and quality:
          // 1. H.264 Baseline (hardware accelerated, low CPU)
          // 2. VP8 (simple, good for local streaming)
          const preferredCodecs = capabilities.codecs.filter(codec => {
            // H.264 Baseline profile (most CPU efficient)
            if (codec.mimeType.includes('H264') &&
                codec.sdpFmtpLine?.includes('profile-level-id=42e01f')) {
              return true;
            }
            // VP8 (simple and efficient)
            if (codec.mimeType.includes('VP8')) {
              return true;
            }
            return false;
          }).sort((a, b) => {
            // H.264 Baseline first, then VP8
            if (a.mimeType.includes('H264')) return -1;
            if (b.mimeType.includes('H264')) return 1;
            return 0;
          });

          if (preferredCodecs.length > 0) {
            transceiver.setCodecPreferences(preferredCodecs);
            console.log('🎯 Set preferred codec for 1080p:', preferredCodecs[0].mimeType);
          } else {
            console.warn('⚠️ No preferred codecs found, using default');
          }
        }
      });

      const offer = await this.senderPC.createOffer({
        offerToReceiveVideo: false,
        voiceActivityDetection: false
      });

      console.log('📋 Offer created');

      console.log('🔧 Setting local description...');
      await this.senderPC.setLocalDescription(offer);
      console.log('✅ Local description set on sender');

      console.log('🔧 Using original SDP - relying on encoding parameters for quality');

      // Return only the serializable parts
      return {
        type: offer.type,
        sdp: offer.sdp
      };
    } catch (error) {
      console.error('❌ Error in sender offer creation:', error);
      return { error: error.message, stack: error.stack };
    }
  }

  /**
   * Set answer from receiver in sender PC
   * @param {Object} answer - WebRTC answer from receiver
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async setAnswer(answer) {
    try {
      console.log('📥 Setting answer in sender...');
      await this.senderPC.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('✅ Remote description set on sender');

      // Flush pending ICE candidates now that remote description is set
      if (this.pendingICECandidates.length > 0) {
        console.log(`🧊 Flushing ${this.pendingICECandidates.length} pending ICE candidates`);
        for (const candidate of this.pendingICECandidates) {
          try {
            await this.senderPC.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('✅ Added queued ICE candidate to sender');
          } catch (error) {
            console.error('❌ Failed to add queued ICE candidate:', error);
          }
        }
        this.pendingICECandidates = [];
      }

      return { success: true };
    } catch (error) {
      console.error('❌ Error setting answer:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop painting to capture canvas
   */
  stopPainting() {
    this.streamingToChild = false;
    console.log('🔴 Stopped painting to capture canvas - child window closed');
  }

  /**
   * Get sender connection status
   * @returns {{connectionState: string, iceConnectionState: string, iceGatheringState: string} | {error: string}}
   */
  getSenderStatus() {
    if (!this.senderPC) {
      return { error: 'Sender PC not initialized' };
    }
    return {
      connectionState: this.senderPC.connectionState,
      iceConnectionState: this.senderPC.iceConnectionState,
      iceGatheringState: this.senderPC.iceGatheringState
    };
  }

  /**
   * Add ICE candidate to sender
   * @param {Object} candidate - ICE candidate
   * @returns {Promise<void>}
   */
  async addICECandidate(candidate) {
    if (!this.senderPC) {
      console.warn('⚠️ Sender PC not initialized, ignoring ICE candidate');
      return;
    }

    // If remote description not set yet, queue the candidate
    if (!this.senderPC.remoteDescription) {
      console.log('🧊 Queueing ICE candidate (remote description not set yet)');
      this.pendingICECandidates.push(candidate);
      return;
    }

    // Remote description is set, add immediately
    try {
      await this.senderPC.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('✅ Added ICE candidate to sender');
    } catch (error) {
      console.error('❌ Failed to add ICE candidate:', error);
    }
  }

  /**
   * Cleanup sender resources
   * @returns {Promise<void>}
   */
  async cleanupSender() {
    if (this.senderPC) {
      try {
        this.senderPC.close();
        console.log('🧹 Sender PC closed');
      } catch (e) {
        console.error('Error closing sender PC:', e);
      }
      this.senderPC = null;
    }
    this.streamingToChild = false;
    this.pendingICECandidates = []; // Clear pending candidates
  }

  // ===== RECEIVER METHODS (for canvas window) =====

  /**
   * Set up WebRTC receiver in canvas window
   * Creates RTCPeerConnection for receiving stream
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async setupReceiver() {
    try {
      console.log('🎬 Setting up WebRTC receiver');

      const video = document.getElementById('video');
      if (!video) {
        return { success: false, error: 'Video element not found' };
      }

      // Create RTCPeerConnection optimized for local 1080p streaming
      const pc = new RTCPeerConnection({
        iceServers: [], // No ICE servers needed for local connection
        iceCandidatePoolSize: 10,
        bundlePolicy: 'balanced',
        rtcpMuxPolicy: 'require'
      });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('🧊 Receiver ICE candidate');
          const { ipcRenderer } = require('electron');
          ipcRenderer.invoke('canvas:sendICECandidate', 'receiver', {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex
          });
        }
      };

      // Handle incoming stream
      pc.ontrack = (event) => {
        console.log('🎥 Received stream');
        video.srcObject = event.streams[0];
        console.log('📺 Connected stream to video');
      };

      // Store reference
      this.receiverPC = pc;

      console.log('✅ Receiver setup complete');
      return { success: true };
    } catch (error) {
      console.error('❌ Receiver error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set offer from sender and create answer
   * @param {Object} offer - WebRTC offer from sender
   * @returns {Promise<{type: string, sdp: string} | {error: string}>}
   */
  async setOfferAndCreateAnswer(offer) {
    try {
      if (!this.receiverPC) {
        throw new Error('receiverPC not available');
      }

      console.log('📥 Received offer in child window:', offer.type);
      console.log('🔧 Setting remote description...');
      await this.receiverPC.setRemoteDescription(offer);
      console.log('✅ Remote description set on receiver');

      // Flush pending ICE candidates now that remote description is set
      if (this.receiverPendingICE.length > 0) {
        console.log(`🧊 Flushing ${this.receiverPendingICE.length} pending ICE candidates`);
        for (const candidate of this.receiverPendingICE) {
          try {
            await this.receiverPC.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('✅ Added queued ICE candidate to receiver');
          } catch (error) {
            console.error('❌ Failed to add queued ICE candidate:', error);
          }
        }
        this.receiverPendingICE = [];
      }

      console.log('📋 Creating answer...');
      const answer = await this.receiverPC.createAnswer();
      console.log('📋 Answer created:', answer.type, answer.sdp.length, 'chars');

      console.log('🔧 Setting local description on receiver...');
      await this.receiverPC.setLocalDescription(answer);
      console.log('✅ Local description set on receiver');

      // Return only the serializable parts
      return {
        type: answer.type,
        sdp: answer.sdp
      };
    } catch (error) {
      console.error('❌ Error in receiver answer creation:', error);
      return { error: error.message, stack: error.stack };
    }
  }

  /**
   * Add ICE candidate to receiver
   * @param {Object} candidate - ICE candidate
   * @returns {Promise<void>}
   */
  async addReceiverICECandidate(candidate) {
    if (!this.receiverPC) {
      console.warn('⚠️ Receiver PC not initialized, ignoring ICE candidate');
      return;
    }

    // If remote description not set yet, queue the candidate
    if (!this.receiverPC.remoteDescription) {
      console.log('🧊 Queueing ICE candidate for receiver (remote description not set yet)');
      this.receiverPendingICE.push(candidate);
      return;
    }

    // Remote description is set, add immediately
    try {
      await this.receiverPC.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('🧊 Added ICE candidate to receiver');
    } catch (error) {
      console.error('❌ Failed to add ICE candidate to receiver:', error);
    }
  }

  /**
   * Get receiver connection status
   * @returns {{connectionState: string, iceConnectionState: string, iceGatheringState: string} | {error: string}}
   */
  getReceiverStatus() {
    if (!this.receiverPC) {
      return { error: 'Receiver PC not initialized' };
    }
    return {
      connectionState: this.receiverPC.connectionState,
      iceConnectionState: this.receiverPC.iceConnectionState,
      iceGatheringState: this.receiverPC.iceGatheringState
    };
  }

  /**
   * Check if receiver is ready
   * @returns {{ready: boolean, hasReceiverPC: boolean}}
   */
  checkReceiverReady() {
    return {
      ready: true,
      hasReceiverPC: !!this.receiverPC
    };
  }

  /**
   * Cleanup receiver resources
   * @returns {Promise<void>}
   */
  async cleanupReceiver() {
    if (this.receiverPC) {
      try {
        this.receiverPC.close();
        console.log('🧹 Receiver PC closed');
      } catch (e) {
        console.error('Error closing receiver PC:', e);
      }
      this.receiverPC = null;
    }
    this.receiverPendingICE = []; // Clear pending candidates
  }
}

// Create singleton instance
const webrtcManager = new WebRTCManager();

// Make it available globally
if (typeof window !== 'undefined') {
  window.webrtcManager = webrtcManager;
}

export default webrtcManager;
