document.addEventListener('DOMContentLoaded', () => {
    // Elementos do DOM
    const videoPlayer = document.getElementById('videoPlayer');
    const videoFileInput = document.getElementById('videoFile');
    const subtitleFileInput = document.getElementById('subtitleFile');
    const subtitleDisplay = document.getElementById('subtitleDisplay');
    const translationDisplay = document.getElementById('translationDisplay');
    const enableTranslationToggle = document.getElementById('enableTranslation');
    const sourceLanguageSelect = document.getElementById('sourceLanguage');
    const targetLanguageSelect = document.getElementById('targetLanguage');
    const voiceSelect = document.getElementById('voiceSelect');
    const rateInput = document.getElementById('rate');
    const rateValue = document.getElementById('rateValue');
    const pitchInput = document.getElementById('pitch');
    const pitchValue = document.getElementById('pitchValue');

    // Estado da aplicação
    const state = {
        enableTranslation: false,
        currentSubtitle: '',
        currentTranslation: '',
        speaking: false,
        sourceLanguage: 'en',
        targetLanguage: 'pt-BR',
        voice: null,
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        subtitles: []
    };

    // Inicializar vozes disponíveis
    function initVoices() {
        let voices = speechSynthesis.getVoices();
        
        // Se nenhuma voz foi carregada, tenta novamente em 100ms
        if (voices.length === 0) {
            setTimeout(initVoices, 100);
            return;
        }

        // Filtrar vozes pelo idioma de destino
        const targetLang = state.targetLanguage.split('-')[0];
        let filteredVoices = voices.filter(voice => 
            voice.lang.startsWith(targetLang) || 
            voice.name.toLowerCase().includes(targetLang)
        );

        // Se não encontrou vozes no idioma de destino, usa todas
        if (filteredVoices.length === 0) {
            filteredVoices = voices;
        }

        // Limpa o select
        voiceSelect.innerHTML = '';

        // Adiciona as vozes ao select
        filteredVoices.forEach((voice, index) => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });

        // Seleciona a primeira voz por padrão
        if (filteredVoices.length > 0) {
            state.voice = filteredVoices[0];
        }
    }

    // Inicializa as vozes quando disponíveis
    if ('speechSynthesis' in window) {
        initVoices();
        speechSynthesis.onvoiceschanged = initVoices;
    }

    // Carregar vídeo local
    videoFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const videoURL = URL.createObjectURL(file);
            videoPlayer.src = videoURL;
        }
    });

    // Carregar legendas VTT
    subtitleFileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                parseVTT(content);
            };
            reader.readAsText(file);
        }
    });

    // Parser simples para arquivo VTT
    function parseVTT(content) {
        state.subtitles = [];
        
        // Divide o conteúdo por linhas
        const lines = content.split('\n');
        let currentSubtitle = null;
        
        // Pula o cabeçalho WEBVTT
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            
            // Timestamps no formato HH:MM:SS.mmm --> HH:MM:SS.mmm
            if (line.includes('-->')) {
                const times = line.split(' --> ');
                currentSubtitle = {
                    start: parseTimeToSeconds(times[0]),
                    end: parseTimeToSeconds(times[1]),
                    text: ''
                };
            } 
            // Texto da legenda
            else if (currentSubtitle && line !== '') {
                // Adiciona o texto à legenda atual
                if (currentSubtitle.text) {
                    currentSubtitle.text += ' ' + line;
                } else {
                    currentSubtitle.text = line;
                }
            } 
            // Linha em branco indica fim de uma legenda
            else if (currentSubtitle && line === '') {
                state.subtitles.push(currentSubtitle);
                currentSubtitle = null;
            }
        }
        
        // Adiciona a última legenda se existir
        if (currentSubtitle) {
            state.subtitles.push(currentSubtitle);
        }
        
        console.log('Legendas carregadas:', state.subtitles);
    }

    // Converte string de tempo para segundos
    function parseTimeToSeconds(timeString) {
        const parts = timeString.split(':');
        let seconds = 0;
        
        // Formato HH:MM:SS.mmm
        if (parts.length === 3) {
            seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        } 
        // Formato MM:SS.mmm
        else if (parts.length === 2) {
            seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        }
        
        return seconds;
    }

    // Verifica as legendas durante a reprodução do vídeo
    videoPlayer.addEventListener('timeupdate', () => {
        const currentTime = videoPlayer.currentTime;
        
        // Encontra a legenda atual baseado no tempo
        const currentSubtitle = state.subtitles.find(subtitle => 
            currentTime >= subtitle.start && currentTime <= subtitle.end
        );
        
        if (currentSubtitle) {
            // Exibe a legenda original
            subtitleDisplay.textContent = currentSubtitle.text;
            
            // Se a tradução está habilitada e a legenda mudou
            if (state.enableTranslation && currentSubtitle.text !== state.currentSubtitle) {
                state.currentSubtitle = currentSubtitle.text;
                translateAndSpeak(currentSubtitle.text);
            }
        } else {
            subtitleDisplay.textContent = '';
            translationDisplay.textContent = '';
        }
    });

    // Função para traduzir e falar o texto
    async function translateAndSpeak(text) {
        if (!text || state.speaking) return;
        
        try {
            // Traduzir o texto
            const translatedText = await translateText(text, state.sourceLanguage, state.targetLanguage);
            
            // Exibir tradução
            translationDisplay.textContent = translatedText;
            state.currentTranslation = translatedText;
            
            // Falar o texto traduzido
            speakText(translatedText);
        } catch (error) {
            console.error('Erro ao traduzir/falar:', error);
        }
    }

    // Função para traduzir texto
    function translateText(text, sourceLang, targetLang) {
        return new Promise((resolve, reject) => {
            fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`)
                .then(response => response.json())
                .then(data => {
                    let translatedText = '';
                    data[0].forEach(item => {
                        translatedText += item[0];
                    });
                    resolve(translatedText);
                })
                .catch(error => {
                    console.error('Erro na tradução:', error);
                    reject(error);
                });
        });
    }

    // Função para sintetizar voz
    function speakText(text) {
        if (!text || typeof speechSynthesis === 'undefined') return;
        
        // Marca como falando para evitar sobreposição
        state.speaking = true;
        
        // Cancela qualquer fala anterior
        speechSynthesis.cancel();
        
        // Cria nova instância de fala
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Configura parâmetros
        utterance.voice = getSelectedVoice();
        utterance.rate = parseFloat(state.rate);
        utterance.pitch = parseFloat(state.pitch);
        utterance.volume = parseFloat(state.volume);
        utterance.lang = state.targetLanguage;
        
        // Eventos
        utterance.onend = () => {
            state.speaking = false;
        };
        
        utterance.onerror = (event) => {
            console.error('Erro na síntese de voz:', event);
            state.speaking = false;
        };
        
        // Inicia a fala
        speechSynthesis.speak(utterance);
    }

    // Obter a voz selecionada
    function getSelectedVoice() {
        const voices = speechSynthesis.getVoices();
        const selectedVoiceName = voiceSelect.value;
        
        return voices.find(voice => voice.name === selectedVoiceName) || voices[0];
    }

    // Pausar a fala quando o vídeo for pausado
    videoPlayer.addEventListener('pause', () => {
        if (typeof speechSynthesis !== 'undefined') {
            speechSynthesis.cancel();
            state.speaking = false;
        }
    });

    // Alternar tradução/dublagem
    enableTranslationToggle.addEventListener('change', (event) => {
        state.enableTranslation = event.target.checked;
        
        // Se ativado e houver uma legenda atual, traduz imediatamente
        if (state.enableTranslation && state.currentSubtitle) {
            translateAndSpeak(state.currentSubtitle);
        } else {
            // Se desativado, limpa a área de tradução e para a fala
            translationDisplay.textContent = '';
            if (typeof speechSynthesis !== 'undefined') {
                speechSynthesis.cancel();
            }
        }
    });

    // Atualizar idiomas
    sourceLanguageSelect.addEventListener('change', (event) => {
        state.sourceLanguage = event.target.value;
    });

    targetLanguageSelect.addEventListener('change', (event) => {
        state.targetLanguage = event.target.value;
        // Atualiza as vozes disponíveis quando o idioma de destino muda
        initVoices();
    });

    // Atualizar taxa de fala
    rateInput.addEventListener('input', (event) => {
        state.rate = event.target.value;
        rateValue.textContent = state.rate;
    });

    // Atualizar tom da voz
    pitchInput.addEventListener('input', (event) => {
        state.pitch = event.target.value;
        pitchValue.textContent = state.pitch;
    });
});
