<script>
	import { onMount } from 'svelte';
	import { adminsStore, filteredAdmins } from '$lib/stores/admins.js';
	import { debugMode as t } from '$lib/i18n-debug';

	let searchInput = '';
	let loading = true;
	let error = '';
	let deletingAdminId = null;

	onMount(async () => {
		try {
			const response = await fetch('/api/user?role=admin');
			if (response.ok) {
				const admins = await response.json();
				console.log('Admins:', admins);
				adminsStore.setAdmins(admins);
			} else {
				const errorData = await response.json();
				error = errorData.error || 'Failed to fetch admins';
				console.error('Failed to fetch admins:', errorData);
			}
		} catch (error) {
			console.error('Error fetching admins:', error);
			error = 'Error loading admins';
		} finally {
			loading = false;
		}
	});

	async function handleSearch(event) {
		const query = event.target.value;
		searchInput = query;
		adminsStore.setSearchQuery(query);
	}

	async function removeAdmin(adminId) {
		if (!confirm($t('Admin.ViewAdmins.confirm_remove'))) {
			return;
		}

		try {
			error = '';
			deletingAdminId = adminId;

			const response = await fetch(`/api/user/${adminId}`, {
				method: 'DELETE'
			});

			const data = await response.json();
			if (response.ok) {
				adminsStore.removeAdmin(adminId);
			} else {
				error = data.error || 'Failed to remove admin';
			}
		} catch (err) {
			error = 'Error removing admin';
			console.error('Error removing admin:', err);
		} finally {
			deletingAdminId = null;
		}
	}
</script>

<div class="p-6 z-10">
	<div class="flex justify-between items-center mb-6">
		<h1 class="text-2xl font-bold">{$t('Admin.ViewAdmins.title')}</h1>
		<div class="relative w-96">
			<input
				type="text"
				placeholder={$t('Admin.ViewAdmins.search_placeholder')}
				class="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
				bind:value={searchInput}
				on:input={handleSearch}
			/>
		</div>
	</div>

	{#if loading}
		<div class="flex justify-center items-center h-64 z-10">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
		</div>
	{:else if error}
		<div class="bg-red-50 p-4 rounded-lg mb-6 z-10">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg
						class="h-5 w-5 text-red-400"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
							clip-rule="evenodd"
						/>
					</svg>
				</div>
				<div class="ml-3">
					<p class="text-sm font-medium text-red-800">{error}</p>
				</div>
			</div>
		</div>
	{:else}
		<div class="bg-white rounded-lg shadow overflow-hidden z-10">
			<table class="min-w-full">
				<thead class="bg-gray-50">
					<tr>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
						>
							{$t('Admin.ViewAdmins.table.name')}
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
						>
							{$t('Admin.ViewAdmins.table.email')}
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
						>
							{$t('Admin.ViewAdmins.table.role')}
						</th>
						<th
							class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
						>
							{$t('Admin.ViewAdmins.table.remove')}
						</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#each $filteredAdmins as admin}
						<tr>
							<td class="px-6 py-4 whitespace-nowrap">
								{admin.fullName}
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								{admin.email}
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								{#if admin.isDirector}
									<span
										class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800"
									>
										{$t('Admin.ViewAdmins.role.director')}
									</span>
								{:else}
									<span
										class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800"
									>
										{$t('Admin.ViewAdmins.role.admin')}
									</span>
								{/if}
							</td>
							<td class="px-6 py-4 whitespace-nowrap">
								{#if deletingAdminId === admin._id}
									<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500"></div>
								{:else}
									<button
										class="text-red-600 hover:text-red-900"
										on:click={() => removeAdmin(admin._id)}
									>
										{$t('Admin.ViewAdmins.table.remove')}
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
