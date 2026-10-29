import { browser } from '$app/environment';

async function fetchWithAuth(url, options = {}) {
	// No need to manually add the token, as it's now handled by HTTP-only cookies
	const response = await fetch(url, {
		...options,
		credentials: 'include' // This ensures cookies are sent with the request
	});

	return response;
}

export async function get(url) {
	return fetchWithAuth(url);
}

export async function post(url, data) {
	return fetchWithAuth(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(data)
	});
}

export async function postPDF(url, data) {
	console.log('postPDF called with:', { url, data });

	const response = await fetchWithAuth(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/pdf'
		},
		body: JSON.stringify(data)
	});

	console.log('PDF response status:', response.status);
	console.log('PDF response headers:', {
		contentType: response.headers.get('Content-Type'),
		contentDisposition: response.headers.get('Content-Disposition'),
		contentLength: response.headers.get('Content-Length')
	});

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		throw new Error(errorData.error || 'Failed to generate PDF');
	}

	try {
		// Get the blob from the response
		const blob = await response.blob();
		console.log('PDF blob size:', blob.size, 'bytes, type:', blob.type);

		if (blob.size === 0) {
			console.error('PDF blob is empty (0 bytes)');
			throw new Error('Generated PDF is empty');
		}

		// Get filename from Content-Disposition header or use default
		const contentDisposition = response.headers.get('Content-Disposition');
		let filename = 'report.pdf';
		if (contentDisposition) {
			const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
			if (matches != null && matches[1]) {
				filename = matches[1].replace(/['"]/g, '');
			}
		}
		console.log('Using filename:', filename);

		// Create a URL for the blob
		const blobUrl = window.URL.createObjectURL(blob);
		console.log('Created blob URL:', blobUrl);

		// Try a different approach - open in a new tab
		console.log('Attempting to open PDF in new tab...');

		// Using window.open to directly open the PDF
		const newWindow = window.open(blobUrl, '_blank');

		if (!newWindow) {
			console.warn('Pop-up blocked or failed to open. Trying alternative method...');

			// Alternative method: Create iframe for viewing
			const iframe = document.createElement('iframe');
			iframe.style.display = 'none';
			iframe.src = blobUrl;
			document.body.appendChild(iframe);

			try {
				// Try to print the iframe content
				iframe.contentWindow.print();
			} catch (e) {
				console.error('Failed to print iframe content:', e);
			}

			// Clean up iframe after a delay
			setTimeout(() => {
				if (iframe.parentNode) {
					document.body.removeChild(iframe);
				}
				window.URL.revokeObjectURL(blobUrl);
			}, 5000);
		} else {
			// Clean up blob URL after a delay (give time for the tab to load)
			setTimeout(() => {
				window.URL.revokeObjectURL(blobUrl);
			}, 5000);
		}

		return response;
	} catch (downloadError) {
		console.error('PDF download processing error:', downloadError);
		throw new Error(`Failed to process PDF download: ${downloadError.message}`);
	}
}

export async function put(url, data) {
	return fetchWithAuth(url, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(data)
	});
}
export async function patch(url, data) {
	return fetchWithAuth(url, {
		method: 'PATCH',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(data)
	});
}
export async function del(url) {
	return fetchWithAuth(url, {
		method: 'DELETE'
	});
}
