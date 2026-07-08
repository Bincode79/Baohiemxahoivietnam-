(function () {
  var userName = '';
  var userPhone = '';
  var userIdCard = '';
  var pendingAttachments = [];

  function toggleChat() {
    var p = document.getElementById('chatPanel');
    var btn = document.getElementById('chatBtn');
    if (!p) return;
    var hidden = p.classList.toggle('hidden');
    btn.style.display = hidden ? '' : 'none';
    if (!hidden && p.querySelector('.chat-start-form')) {
      p.querySelector('.chat-start-form input')?.focus();
    }
  }

  function closeChat() {
    var p = document.getElementById('chatPanel');
    var btn = document.getElementById('chatBtn');
    if (p) p.classList.add('hidden');
    if (btn) btn.style.display = '';
  }

  function startChat() {
    userName = document.getElementById('chatName')?.value?.trim() || '';
    userPhone = document.getElementById('chatPhone')?.value?.trim() || '';
    userIdCard = document.getElementById('chatIdCard')?.value?.trim() || '';
    if (!userName || !userPhone || !userIdCard) {
      alert('Vui lòng nhập đầy đủ họ tên, số CCCD và số điện thoại');
      return;
    }
    document.getElementById('chatStartForm').style.display = 'none';
    document.getElementById('chatMessages').style.display = 'flex';
    document.getElementById('chatInputArea').style.display = 'flex';
    document.getElementById('chatInput').focus();
    addMessage('admin', 'Chào ' + userName + '! Bạn cần hỗ trợ gì ạ?');
  }

  function triggerAttachment() {
    var input = document.getElementById('chatFileInput');
    if (input) input.click();
  }

  function handleFileSelect(e) {
    var files = e.target.files;
    if (!files || files.length === 0) return;
    
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        showToast('Tệp ' + file.name + ' vượt quá 10MB', 'error');
        continue;
      }
      
      var type = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : 'file');
      var reader = new FileReader();
      
      (function(f, t) {
        reader.onload = function(evt) {
          var dataUrl = evt.target.result;
          addAttachmentPreview(dataUrl, f.name, f.size, t, f);
          pendingAttachments.push({ file: f, dataUrl: dataUrl, type: t });
        };
        reader.readAsDataURL(f);
      })(file, type);
    }
    
    e.target.value = '';
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getFileIcon(type, fileName) {
    if (type === 'image') return '<i class="bi bi-image"></i>';
    if (type === 'video') return '<i class="bi bi-camera-video"></i>';
    var ext = fileName.split('.').pop().toLowerCase();
    var iconMap = {
      'pdf': '<i class="bi bi-file-earmark-pdf-fill"></i>',
      'doc': '<i class="bi bi-file-earmark-word-fill"></i>',
      'docx': '<i class="bi bi-file-earmark-word-fill"></i>',
      'xls': '<i class="bi bi-file-earmark-excel-fill"></i>',
      'xlsx': '<i class="bi bi-file-earmark-excel-fill"></i>',
      'ppt': '<i class="bi bi-file-earmark-ppt-fill"></i>',
      'pptx': '<i class="bi bi-file-earmark-ppt-fill"></i>',
      'zip': '<i class="bi bi-file-earmark-zip-fill"></i>',
      'rar': '<i class="bi bi-file-earmark-zip-fill"></i>',
      'txt': '<i class="bi bi-file-earmark-text-fill"></i>'
    };
    return iconMap[ext] || '<i class="bi bi-file-earmark-fill"></i>';
  }

  function addAttachmentPreview(dataUrl, fileName, fileSize, type, fileObj) {
    var preview = document.getElementById('chatAttachmentPreview');
    var container = document.createElement('div');
    container.className = 'chat-attachment-item';
    container.dataset.fileName = fileName;
    
    var iconClass = type === 'image' ? 'image' : (type === 'video' ? 'video' : 'file');
    var content = '';
    
    if (type === 'image') {
      content = '<img src="' + dataUrl + '" alt="' + fileName + '" class="chat-attachment-img">';
    } else if (type === 'video') {
      content = '<video src="' + dataUrl + '" class="chat-attachment-video" controls preload="metadata"></video>';
    } else {
      content = '<div class="chat-attachment-file">' + 
        '<span class="chat-attachment-file-icon ' + iconClass + '">' + getFileIcon(type, fileName) + '</span>' +
        '<span class="chat-attachment-file-info">' +
          '<span class="chat-attachment-file-name">' + fileName + '</span>' +
          '<span class="chat-attachment-file-size">' + formatFileSize(fileSize) + '</span>' +
        '</span>' +
      '</div>';
    }
    
    container.innerHTML = content + '<button class="chat-attachment-remove" onclick="removeAttachment(this, \'' + fileName + '\')"><i class="bi bi-x-lg"></i></button>';
    preview.appendChild(container);
    preview.style.display = 'flex';
    
    updateSendButtonState();
  }

  function removeAttachment(btn, fileName) {
    var container = btn.closest('.chat-attachment-item');
    if (container) container.remove();
    
    for (var i = pendingAttachments.length - 1; i >= 0; i--) {
      if (pendingAttachments[i].file.name === fileName) {
        pendingAttachments.splice(i, 1);
      }
    }
    
    var preview = document.getElementById('chatAttachmentPreview');
    if (!preview.children.length) {
      preview.style.display = 'none';
    }
    
    updateSendButtonState();
  }

  function clearAllAttachments() {
    pendingAttachments = [];
    var preview = document.getElementById('chatAttachmentPreview');
    if (preview) {
      preview.innerHTML = '';
      preview.style.display = 'none';
    }
    updateSendButtonState();
  }

  function updateSendButtonState() {
    var input = document.getElementById('chatInput');
    var sendBtn = document.getElementById('chatSendBtn');
    var hasText = input && input.value.trim();
    var hasAttachments = pendingAttachments.length > 0;
    sendBtn.disabled = !hasText && !hasAttachments;
  }

  function sendMessage() {
    var input = document.getElementById('chatInput');
    var text = input.value.trim();
    
    if (!text && pendingAttachments.length === 0) return;
    
    var attachmentsData = [];
    
    for (var i = 0; i < pendingAttachments.length; i++) {
      var att = pendingAttachments[i];
      attachmentsData.push({
        name: att.file.name,
        type: att.type,
        size: att.file.size,
        dataUrl: att.dataUrl
      });
    }
    
    addMessage('user', text, attachmentsData);
    input.value = '';
    clearAllAttachments();

    var msg = {
      userName: userName,
      phone: userPhone,
      idCard: userIdCard,
      text: text,
      attachments: attachmentsData
    };

    // Sử dụng apiRequest thay vì fetch để có retry logic
    var requestFn = typeof apiRequest !== 'undefined' ? apiRequest : fetch;
    var requestPromise = typeof apiRequest !== 'undefined'
      ? apiRequest('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg),
        })
      : fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg),
        });

    requestPromise
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.success && data.conversation) {
          var msgs = data.conversation.messages;
          if (msgs && msgs.length > 1) {
            var lastMsg = msgs[msgs.length - 1];
            var secondLastMsg = msgs[msgs.length - 2];
            if (lastMsg.from === 'admin' && lastMsg !== secondLastMsg) {
              addMessage('admin', lastMsg.text);
            }
          }
        }
      });
  }

  function addMessage(from, text, attachments) {
    var container = document.getElementById('chatMessages');
    var div = document.createElement('div');
    div.className = 'chat-msg ' + from;
    var now = new Date();
    var time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    
    var content = '';
    
    if (attachments && attachments.length > 0) {
      content += '<div class="chat-msg-attachments">';
      for (var i = 0; i < attachments.length; i++) {
        var att = attachments[i];
        if (att.type === 'image') {
          content += '<div class="chat-msg-attachment chat-msg-attachment--image">' +
            '<img src="' + att.dataUrl + '" alt="' + att.name + '" onclick="previewImage(this.src)">' +
          '</div>';
        } else if (att.type === 'video') {
          content += '<div class="chat-msg-attachment chat-msg-attachment--video">' +
            '<video src="' + att.dataUrl + '" controls preload="metadata"></video>' +
          '</div>';
        } else {
          content += '<div class="chat-msg-attachment chat-msg-attachment--file">' +
            '<span class="chat-msg-attachment-icon">' + getFileIcon(att.type, att.name) + '</span>' +
            '<span class="chat-msg-attachment-info">' +
              '<span class="chat-msg-attachment-name">' + att.name + '</span>' +
              '<span class="chat-msg-attachment-size">' + formatFileSize(att.size) + '</span>' +
            '</span>' +
          '</div>';
        }
      }
      content += '</div>';
    }
    
    if (text) {
      content += '<div class="chat-msg-text">' + escapeHtml(text) + '</div>';
    }
    
    content += '<span class="time">' + time + '</span>';
    div.innerHTML = content;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
  }

  function previewImage(src) {
    var modal = document.getElementById('chatImagePreview');
    var img = document.getElementById('chatImagePreviewImg');
    if (modal && img) {
      img.src = src;
      modal.style.display = 'flex';
    }
  }

  function closeImagePreview() {
    var modal = document.getElementById('chatImagePreview');
    if (modal) modal.style.display = 'none';
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('chatPanel')) return;

    document.getElementById('chatBtn')?.addEventListener('click', toggleChat);
    document.getElementById('chatClose')?.addEventListener('click', closeChat);
    document.getElementById('chatStartBtn')?.addEventListener('click', startChat);
    document.getElementById('chatSendBtn')?.addEventListener('click', sendMessage);
    document.getElementById('chatInput')?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    
    document.getElementById('chatInput')?.addEventListener('input', function() {
      updateSendButtonState();
    });
    
    var fileInput = document.getElementById('chatFileInput');
    if (fileInput) {
      fileInput.addEventListener('change', handleFileSelect);
    }
    
    var imageBtn = document.getElementById('chatImageBtn');
    if (imageBtn) {
      imageBtn.addEventListener('click', function() {
        document.getElementById('chatFileInput').accept = 'image/*';
        triggerAttachment();
      });
    }
    
    var videoBtn = document.getElementById('chatVideoBtn');
    if (videoBtn) {
      videoBtn.addEventListener('click', function() {
        document.getElementById('chatFileInput').accept = 'video/*';
        triggerAttachment();
      });
    }
    
    var attachBtn = document.getElementById('chatAttachBtn');
    if (attachBtn) {
      attachBtn.addEventListener('click', triggerAttachment);
    }
    
    var imagePreviewModal = document.getElementById('chatImagePreview');
    if (imagePreviewModal) {
      imagePreviewModal.addEventListener('click', function(e) {
        if (e.target === imagePreviewModal) closeImagePreview();
      });
    }
    
    updateSendButtonState();
  });
})();
