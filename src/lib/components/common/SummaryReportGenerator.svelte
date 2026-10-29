<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import Button from '../buttons/Button.svelte';
	import Download from '../feather/download.svelte';

	const dispatch = createEventDispatcher();

	// Props
	export let patientId = null;
	export let size = 'large';
	export let variant = 'primary';
	export let generateApiEndpoint = '/api/generative-summary';
	export let checkStatusApiEndpoint = '/api/generative-summary';
	export let downloadApiEndpoint = '/api/download-generative-summary';

	// State variables
	let summaryReportProcessing = false;
	let checkingReportStatus = false;
	let reportReady = false;
	let checkingRequiredTests = false;
	let requiredTestsComplete = false;
	let downloadingReport = false;
	let sendingReport = false;
	// Generate summary report
	async function openGenerateSummaryReport() {
		try {
			sendingReport = true;
			console.log('Generate Summary Report clicked for patient:', patientId);

			// Real API call to generative-summary endpoint
			const response = await fetch(generateApiEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					patientId: patientId
				})
			});

			if (response.ok) {
				sendingReport = false;
				const data = await response.json();
				console.log('Summary report generated successfully:', data);
				summaryReportProcessing = true;
				dispatch('reportGenerated', { patientId, data });
			} else {
				sendingReport = false;
				const errorData = await response.json().catch(() => ({}));
				console.error('Failed to generate summary report:', response.status, errorData);
				dispatch('error', {
					type: 'generate',
					status: response.status,
					message: errorData.error || 'Failed to generate report',
					details: errorData.details
				});
			}
		} catch (error) {
			sendingReport = false;
			console.error('Error calling summary report API:', error);
			dispatch('error', { type: 'generate', error: error.message });
		}
	}

	// Check report status
	async function refreshReportStatus() {
		try {
			checkingReportStatus = true;
			console.log('Refreshing report status for patient:', patientId);

			// Real API call to check report status (GET request with query param)
			const response = await fetch(`${checkStatusApiEndpoint}?patientId=${patientId}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				const data = await response.json();
				console.log('Report status refresh response:', data);

				// Handle different status responses from the API
				if (data.status === 'completed') {
					// Report is ready for download
					reportReady = true;
					console.log('✅ Report is completed and ready for download!');
					dispatch('statusChecked', {
						patientId,
						data,
						ready: true,
						message: 'Report is ready for download!'
					});
				} else if (data.status === 'processing') {
					// Still processing, keep waiting
					reportReady = false;
					console.log('⏳ Report is still processing...');
					dispatch('statusChecked', {
						patientId,
						data,
						ready: false,
						message: 'Report is still being processed. Please check again later.'
					});
				} else if (data.status === 'Need to start') {
					// No report exists or was cleaned up, reset to initial state
					summaryReportProcessing = false;
					reportReady = false;
					console.log('🔄 No report found. Please generate a new report.');
					dispatch('statusChecked', {
						patientId,
						data,
						ready: false,
						message: 'No report found. Please generate a new report.'
					});
				} else {
					// Unexpected status
					console.warn('⚠️ Unexpected status received:', data.status);
					dispatch('statusChecked', {
						patientId,
						data,
						ready: false,
						message: `Unexpected status: ${data.status}`
					});
				}
			} else {
				const errorData = await response.json().catch(() => ({}));
				console.error('❌ Failed to check report status:', response.status, errorData);
				dispatch('error', {
					type: 'status',
					status: response.status,
					message: errorData.error || 'Failed to check status',
					details: errorData.details || `HTTP ${response.status}`
				});
			}
		} catch (error) {
			console.error('❌ Network error checking report status:', error);
			dispatch('error', {
				type: 'status',
				error: error.message,
				message: 'Network error while checking status. Please try again.'
			});
		} finally {
			checkingReportStatus = false;
		}
	}

	// Download summary report
	async function downloadSummaryReport() {
		try {
			downloadingReport = true;
			console.log('Downloading summary report for patient:', patientId);

			// Real API call to download the completed report
			const response = await fetch(`${downloadApiEndpoint}/${encodeURIComponent(patientId)}`);

			if (response.ok) {
				// Check if the response is a PDF file
				const contentType = response.headers.get('content-type');
				if (contentType && contentType.includes('application/pdf')) {
					// Get the PDF blob
					const pdfBlob = await response.blob();

					// Create download link
					const url = window.URL.createObjectURL(pdfBlob);
					const link = document.createElement('a');
					link.href = url;

					// Get filename from Content-Disposition header or create default
					const contentDisposition = response.headers.get('content-disposition');
					let filename = `generative_report_${patientId}_${Date.now()}.pdf`;

					if (contentDisposition) {
						const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
						if (filenameMatch) {
							filename = filenameMatch[1];
						}
					}

					link.download = filename;
					document.body.appendChild(link);
					link.click();

					// Cleanup
					document.body.removeChild(link);
					window.URL.revokeObjectURL(url);

					console.log('✅ PDF downloaded successfully:', filename);
					dispatch('downloadRequested', {
						patientId,
						success: true,
						filename,
						message: 'Report downloaded successfully!'
					});
				} else {
					// Handle non-PDF response (probably an error)
					const errorData = await response.json().catch(() => ({}));
					throw new Error(errorData.error || 'Invalid response format');
				}
			} else {
				// Handle HTTP errors
				const errorData = await response.json().catch(() => ({}));
				console.error('❌ Failed to download report:', response.status, errorData);

				dispatch('error', {
					type: 'download',
					status: response.status,
					message: errorData.error || 'Failed to download report',
					details: errorData.details || `HTTP ${response.status}`
				});
			}
		} catch (error) {
			console.error('❌ Error downloading report:', error);
			dispatch('error', {
				type: 'download',
				error: error.message,
				message: 'Error downloading report. Please try again.'
			});
		} finally {
			downloadingReport = false;
		}
	}

	// Reset component state (useful for external control)
	export function reset() {
		summaryReportProcessing = false;
		checkingReportStatus = false;
		reportReady = false;
		requiredTestsComplete = false;
		downloadingReport = false;
	}

	// Set processing state (useful for external control)
	export function setProcessing(processing = true) {
		summaryReportProcessing = processing;
	}

	// Check if required tests are completed
	async function checkRequiredTests() {
		if (!patientId) return;

		checkingRequiredTests = true;
		const targetTestCodes = [
			'THERAPIST_MATCH',
			'ADULT_BIO',
			'stressful_beliefs_index',
			'depression_test',
			'generalized_anxiety_test'
		];

		try {
			// Check assignments and completion status for required tests
			const response = await fetch(`/api/allocated-tests/progress/${patientId}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				const progressData = await response.json();
				console.log('Patient progress data:', progressData);

				// Map test titles to test codes since API returns titles, not test_codes
				const testTitleToCode = {
					'Therapist Matching': 'THERAPIST_MATCH',
					'Adult Biographical': 'ADULT_BIO',
					'Stressful Beliefs Index': 'stressful_beliefs_index',
					'Depression Interview': 'depression_test',
					'Generalized Anxiety Interview': 'generalized_anxiety_test'
				};

				// Check if all required tests are completed (progress >= 100%)
				const requiredTests = progressData.filter((test) => {
					const testCode = testTitleToCode[test.title];
					return testCode && targetTestCodes.includes(testCode);
				});

				console.log('Required tests progress:', requiredTests);

				// All required tests must be assigned and completed (100% progress)
				const allTestsAssigned = targetTestCodes.every((testCode) =>
					requiredTests.some((test) => testTitleToCode[test.title] === testCode)
				);

				const allTestsCompleted = requiredTests.every((test) => test.progress >= 100);

				requiredTestsComplete = allTestsAssigned && allTestsCompleted;

				console.log('Required tests check:', {
					targetTestCodes,
					requiredTests: requiredTests.map((t) => ({
						title: t.title,
						test_code: testTitleToCode[t.title],
						progress: t.progress
					})),
					allTestsAssigned,
					allTestsCompleted,
					requiredTestsComplete
				});
			} else {
				console.error('Failed to fetch test progress:', response.status);
				// Default to false if we can't check
				requiredTestsComplete = false;
			}
		} catch (error) {
			console.error('Error checking required tests:', error);
			// Default to false if there's an error
			requiredTestsComplete = false;
		} finally {
			checkingRequiredTests = false;
		}
	}

	// Check initial status when component loads
	async function checkInitialStatus() {
		if (!patientId) return;

		try {
			const response = await fetch(`${checkStatusApiEndpoint}?patientId=${patientId}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				const data = await response.json();
				console.log('Initial status check:', data);

				if (data.status === 'completed') {
					summaryReportProcessing = true;
					reportReady = true;
				} else if (data.status === 'processing') {
					summaryReportProcessing = true;
					reportReady = false;
				}
				// If 'Need to start', keep default state (all false)
			}
		} catch (error) {
			console.error('Error checking initial status:', error);
			// Don't dispatch error for initial check, just log it
		}
	}

	// Check status when component mounts or patientId changes
	onMount(() => {
		checkInitialStatus();
		checkRequiredTests();
	});
	$: if (patientId) {
		checkInitialStatus();
		checkRequiredTests();
	}
</script>

<!-- {#if summaryReportProcessing}
	{#if checkingReportStatus}
		<div class="text-sm text-gray-600 flex items-center gap-2">
			<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-Success"></div>
			Checking...
		</div>
	{:else if reportReady}
		<Button
			label={downloadingReport ? "Downloading..." : "Download Summary Report"}
			loadingText={downloadingReport ? "Downloading..." : "Download Summary Report"}
			onClick={downloadSummaryReport}
			{size}
			icon={true}
			iconOnSide="left"
			loading={downloadingReport}
			disabled={downloadingReport}
		>
			<Download slot="icon" />
		</Button>
	{:else}
		<div class="text-sm text-gray-600">
			Processing can take 1-2 days, 
			<button 
				class="text-Success hover:text-Success_hover underline decoration-dotted cursor-pointer"
				on:click={refreshReportStatus}
			>
				click to refresh status
			</button>
		</div>
	{/if}
{:else}
	{#if checkingRequiredTests}
		<Button
			label="Checking Interviews..."
			disabled={true}
			{size}
		/>
	{:else if !requiredTestsComplete}
		<Button
			label="Incomplete Interviews for Summary"
			disabled={true}
			{size}
		/>
	{:else}
		<Button
			label={sendingReport? "Sending Report..." :"Generate Summary Report"}
			loadingText={sendingReport? "Sending Report..." : "Generate Summary Report"}
			onClick={openGenerateSummaryReport}
			{size}
			loading={sendingReport}
			disabled={sendingReport}
		/>
	{/if}
{/if}  -->
