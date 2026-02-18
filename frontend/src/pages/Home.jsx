import { GitMerge, AlertCircle, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';

const Home = () => {
  const userName = 'Deepanshu Sharma';

  return (
    <div className="bg-[#fbfbfb] min-h-[calc(100vh-48px)]">
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-[#6e49cb]">
          <Link to="/" className="hover:underline">Your work</Link>
          <span className="text-gray-400">/</span>
          <span className="text-[#303030]">Home</span>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="flex gap-6">
          <div className="flex-1">
            <div className="mb-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-12 h-12 text-white" viewBox="0 0 48 48">
                    <defs>
                      <pattern id="dots" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                        <circle cx="4" cy="4" r="1.5" fill="white" />
                      </pattern>
                    </defs>
                    <rect width="48" height="48" fill="url(#dots)" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs text-[#6e49cb] font-medium mb-1">Today's highlights</div>
                  <h1 className="text-3xl font-normal text-[#303030]">Hi, {userName}</h1>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white border border-gray-200 rounded p-4 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#303030]">Merge requests</span>
                  <GitMerge className="w-4 h-4 text-gray-500" />
                </div>
                <div className="text-3xl font-normal text-[#303030] mb-1">0</div>
                <div className="text-xs text-[#666] flex items-center gap-1">
                  Waiting for your review
                  <span className="text-[#666]">Just now</span>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded p-4 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#303030]">Merge requests</span>
                  <GitMerge className="w-4 h-4 text-gray-500" />
                </div>
                <div className="text-3xl font-normal text-[#303030] mb-1">0</div>
                <div className="text-xs text-[#666] flex items-center gap-1">
                  Assigned to you
                  <span className="text-[#666]">Just now</span>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded p-4 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#303030]">Issues</span>
                  <AlertCircle className="w-4 h-4 text-gray-500" />
                </div>
                <div className="text-3xl font-normal text-[#303030] mb-1">0</div>
                <div className="text-xs text-[#666] flex items-center gap-1">
                  Assigned to you
                  <span className="text-[#666]">Just now</span>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded p-4 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#303030]">Issues</span>
                  <AlertCircle className="w-4 h-4 text-gray-500" />
                </div>
                <div className="text-3xl font-normal text-[#303030] mb-1">0</div>
                <div className="text-xs text-[#666] flex items-center gap-1">
                  Authored by you
                  <span className="text-[#666]">Just now</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-medium text-[#303030]">Items that need your attention</h2>
                <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#303030] border border-gray-300 rounded hover:border-gray-400 hover:bg-gray-50 transition-colors">
                  Everything
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              <div className="flex items-start gap-4 py-4">
                <div className="w-12 h-12 rounded-full bg-[#91d4a8] flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-[#108548]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-[#303030]">
                    <span className="font-semibold">Good job!</span> All your to-do items are done.
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <Link to="/scans" className="text-sm text-[#1f75cb] hover:underline">
                  View recent scans
                </Link>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-medium text-[#303030]">Follow the latest updates</h2>
                <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#303030] border border-gray-300 rounded hover:border-gray-400 hover:bg-gray-50 transition-colors">
                  Your activity
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-3 py-3">
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-[#303030]">
                    Pushed new branch <span className="font-mono text-sm bg-gray-100 px-1 py-0.5 rounded">main</span> at{' '}
                    <Link to="#" className="text-[#1f75cb] hover:underline">
                      Deepanshu Sharma / qarwaan
                    </Link>
                  </p>
                </div>
                <div className="text-xs text-[#666]">17 hours ago</div>
              </div>
            </div>
          </div>

          <div className="w-80">
            <div className="bg-white border border-gray-200 rounded p-4 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#303030]">Quick access</h2>
                <button className="p-1 hover:bg-gray-100 rounded">
                  <Settings className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="flex gap-2 mb-4">
                <button className="flex-1 px-3 py-1.5 text-sm text-[#303030] bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 transition-colors">
                  Recently viewed
                </button>
                <button className="flex-1 px-3 py-1.5 text-sm text-[#303030] border border-gray-300 rounded hover:bg-gray-50 transition-colors">
                  Projects
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                  <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center text-xs font-semibold text-[#303030]">
                    M
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[#303030] truncate">Mortygram - ESC / Mortygram</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                  <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center text-xs font-semibold text-[#303030]">
                    Q
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[#303030] truncate">qarwaan - Deepanshu Sharma / qarwaan</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                  <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center text-xs font-semibold text-[#303030]">
                    S
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[#303030] truncate">secure_cicd_pipeline - Deepanshu Sharma / se...</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-200">
                <p className="text-xs text-[#666]">Displaying frequently visited projects.</p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded p-4">
              <h2 className="text-sm font-semibold text-[#303030] mb-2">Share your feedback</h2>
              <p className="text-sm text-[#666] mb-3">
                Help us improve the new homepage by sharing your thoughts and suggestions.
              </p>
              <Link to="#" className="text-sm text-[#1f75cb] hover:underline">
                Leave feedback
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
